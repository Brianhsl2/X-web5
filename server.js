const path = require('path');
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 3000);
const rateWindowMs = Number(process.env.CONTACT_RATE_WINDOW_MS || 10 * 60 * 1000);
const rateMaxRequests = Number(process.env.CONTACT_RATE_MAX || 5);
const rateBuckets = new Map();

app.use(cors());
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname)));

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function createTransporter() {
  return nodemailer.createTransport({
    host: requiredEnv('SMTP_HOST'),
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: {
      user: requiredEnv('SMTP_USER'),
      pass: requiredEnv('SMTP_PASS')
    }
  });
}

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
  if (bucket.count > rateMaxRequests) {
    return true;
  }

  return false;
}

function normalizeField(value, maxLen) {
  return String(value || '').trim().slice(0, maxLen);
}

function isValidEmail(value) {
  if (!value || value.length > 254) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

app.post('/api/contact', async (req, res) => {
  if (isRateLimited(req.ip)) {
    return res.status(429).json({ ok: false, error: 'Too many requests. Please try again soon.' });
  }

  const name = normalizeField(req.body && req.body.name, 120);
  const email = normalizeField(req.body && req.body.email, 254);
  const company = normalizeField(req.body && req.body.company, 120);
  const role = normalizeField(req.body && req.body.role, 120);
  const focus = normalizeField(req.body && req.body.focus, 180);
  const timeline = normalizeField(req.body && req.body.timeline, 60);
  const message = normalizeField(req.body && req.body.message, 4000);
  const website = normalizeField(req.body && req.body.website, 120);

  if (website) {
    return res.json({ ok: true });
  }

  if (!name || !email) {
    return res.status(400).json({ ok: false, error: 'Name and work email are required.' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: 'Enter a valid work email address.' });
  }

  const to = process.env.CONTACT_TO || 'information@xenablers.com';
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
    const transporter = createTransporter();
    await transporter.sendMail({
      from,
      to,
      replyTo: email,
      subject: `Contact request from ${name}`,
      text
    });

    return res.json({ ok: true });
  } catch (error) {
    console.error('Contact send failed:', error);
    return res.status(500).json({ ok: false, error: 'Unable to send email right now.' });
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

function startServer() {
  return app.listen(port, () => {
    console.log(`Contact backend running on http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };

