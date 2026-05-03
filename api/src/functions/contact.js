const { app } = require('@azure/functions');
const nodemailer = require('nodemailer');

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

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const to   = process.env.CONTACT_TO   || 'information@xenablers.com';
    const from = process.env.CONTACT_FROM || process.env.SMTP_USER;

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
      await transporter.sendMail({
        from,
        to,
        replyTo: email,
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
