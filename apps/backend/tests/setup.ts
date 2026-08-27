process.env.NODE_ENV = 'test';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.PUBLIC_APP_URL = 'http://localhost:3001';
process.env.PUBLIC_FRONTEND_URL = 'http://localhost:5173';
process.env.MOCK_WEBHOOK_SECRET = 'test-mock-webhook-secret';
process.env.PAYMENT_HOLD_MINUTES = '15';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.EMAIL_ENABLED = 'false';
process.env.EMAIL_FROM = 'TeaTicket <no-reply@tea-ticket.com>';
process.env.EMAIL_REPLY_TO = 'support@tea-ticket.com';
process.env.EMAIL_MAX_ATTEMPTS = '5';
process.env.RESEND_WEBHOOK_SECRET = 'whsec_dGVzdHNlY3JldDEyMzQ1Njc4OTA=';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://teaticket:secret@localhost:5432/teaticket_test';
}
