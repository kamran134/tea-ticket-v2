process.env.NODE_ENV = 'test';
process.env.TEST_MODE = 'true';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.PUBLIC_APP_URL = 'http://localhost:3001';
process.env.PUBLIC_FRONTEND_URL = 'http://localhost:5173';
process.env.MOCK_WEBHOOK_SECRET = 'test-mock-webhook-secret';
process.env.BOOKING_TTL_SECONDS = '30';
process.env.PAYMENT_TTL_SECONDS = '30';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.EMAIL_ENABLED = 'false';
process.env.EMAIL_FROM = 'BirManat Tickets <no-reply@tickets.birmanat.band>';
process.env.EMAIL_REPLY_TO = 'support@birmanat.band';
process.env.EMAIL_MAX_ATTEMPTS = '5';
process.env.RESEND_WEBHOOK_SECRET = 'whsec_dGVzdHNlY3JldDEyMzQ1Njc4OTA=';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://teaticket:secret@localhost:5432/teaticket_test';
}
