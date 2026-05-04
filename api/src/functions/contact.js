const { app } = require('@azure/functions');
const { ClientSecretCredential } = require('@azure/identity');

const rateWindowMs = Number(process.env.CONTACT_RATE_WINDOW_MS || 10 * 60 * 1000);
const rateMaxRequests = Number(process.env.CONTACT_RATE_MAX || 5);
const rateBuckets = new Map();

function cleanupRateBuckets(now) {
  for (const [ip, bucket] of rateBuckets.entries()) {
    if (now - bucket.windowStart > rateWindowMs) {
      rateBuckets.delete(ip);
    }
  }
}

function isRateLimited(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  cleanupRateBuckets(now);
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.windowStart > rateWindowMs) {
    rateBuckets.set(key, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > rateMaxRequests;
}

function normalizeField(value, maxLen) {
  return String(value || '').trim().slice(0, maxLen);
}

function isValidEmail(value) {
  if (!value || value.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function sendViaGraph({ tenantId, clientId, clientSecret, sender, to, subject, text }) {
  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  const token = await credential.getToken('https://graph.microsoft.com/.default');

  if (!token || !token.token) {
    throw new Error('Failed to acquire Microsoft Graph token.');
  }

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: 'Text',
            content: text
          },
          toRecipients: [{ emailAddress: { address: to } }]
        },
        saveToSentItems: true
      })
    }
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Graph send failed with ${response.status}: ${details}`);
  }
}

app.http('contact', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'contact',
  handler: async (request, context) => {
    const ip =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('client-ip') ||
      'unknown';

    if (isRateLimited(ip)) {
      return {
        status: 429,
        jsonBody: { ok: false, error: 'Too many requests. Please try again soon.' }
      };
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { ok: false, error: 'Invalid request body.' } };
    }

    const name     = normalizeField(body.name,     120);
    const email    = normalizeField(body.email,    254);
    const company  = normalizeField(body.company,  120);
    const role     = normalizeField(body.role,     120);
    const focus    = normalizeField(body.focus,    180);
    const timeline = normalizeField(body.timeline,  60);
    const message  = normalizeField(body.message, 4000);
    const website  = normalizeField(body.website,  120);

    // Honeypot — bots fill this field; silently accept and discard
    if (website) {
      return { status: 200, jsonBody: { ok: true } };
    }

    if (!name || !email) {
      return {
        status: 400,
        jsonBody: { ok: false, error: 'Name and work email are required.' }
      };
    }

    if (!isValidEmail(email)) {
      return {
        status: 400,
        jsonBody: { ok: false, error: 'Enter a valid work email address.' }
      };
    }

    const tenantId = process.env.GRAPH_TENANT_ID;
    const clientId = process.env.GRAPH_CLIENT_ID;
    const clientSecret = process.env.GRAPH_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
      context.error('Missing Microsoft Graph app credentials.');
      return {
        status: 500,
        jsonBody: { ok: false, error: 'Unable to send email right now.' }
      };
    }

    const to =
      process.env.XENABLERS_CONTACT_TO ||
      process.env.CONTACT_TO ||
      'information@xenablers.com';
    const sender = process.env.GRAPH_SENDER || 'information@xenablers.com';

    const text = [
      `Name: ${name}`,
      `Work email: ${email}`,
      `Company: ${company || 'N/A'}`,
      `Role: ${role || 'N/A'}`,
      `Area of focus: ${focus || 'N/A'}`,
      `Timeline: ${timeline || 'N/A'}`,
      '',
      'Outcome / message:',
      message || 'N/A'
    ].join('\n');

    try {
      await sendViaGraph({
        tenantId,
        clientId,
        clientSecret,
        sender,
        to,
        subject: `Contact request from ${name}`,
        text
      });
      return { status: 200, jsonBody: { ok: true } };
    } catch (error) {
      context.error('Contact send failed:', error.message);
      return {
        status: 500,
        jsonBody: { ok: false, error: 'Unable to send email right now.' }
      };
    }
  }
});
