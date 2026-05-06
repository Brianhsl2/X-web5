process.env.CONTACT_RATE_MAX = '100';
process.env.CONTACT_RATE_WINDOW_MS = '600000';

const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail }));

jest.mock('nodemailer', () => ({
  createTransport: mockCreateTransport
}));

const request = require('supertest');
const { app } = require('../server');

describe('server smoke tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'no-reply@example.com';
    process.env.SMTP_PASS = 'test-secret';
    process.env.CONTACT_TO = 'team@example.com';
    delete process.env.CONTACT_FROM;
  });

  test('GET /health returns ok', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  test('POST /api/contact rejects requests missing name or email', async () => {
    const response = await request(app).post('/api/contact').send({ name: 'Alex' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ ok: false, error: 'Name and work email are required.' });
    expect(mockCreateTransport).not.toHaveBeenCalled();
  });

  test('POST /api/contact accepts honeypot requests without sending mail', async () => {
    const response = await request(app).post('/api/contact').send({
      name: 'Alex',
      email: 'alex@example.com',
      website: 'https://spam.example'
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(mockCreateTransport).not.toHaveBeenCalled();
  });

  test('POST /api/contact sends mail for valid requests', async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: 'test-123' });

    const response = await request(app).post('/api/contact').send({
      name: 'Alex Smith',
      email: 'alex@example.com',
      company: 'X Corp',
      role: 'VP Ops',
      focus: 'Operational resilience',
      timeline: 'Next quarter',
      message: 'Interested in an assessment.'
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(mockCreateTransport).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'team@example.com',
        replyTo: 'alex@example.com',
        subject: 'Contact request from Alex Smith'
      })
    );
  });

  test('POST /api/contact returns 500 when SMTP send fails', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP unavailable'));

    const response = await request(app).post('/api/contact').send({
      name: 'Taylor Reed',
      email: 'taylor@example.com',
      message: 'Need help with rollout governance.'
    });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ ok: false, error: 'Unable to send email right now.' });
    expect(mockCreateTransport).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });
});
