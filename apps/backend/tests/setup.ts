process.env.NODE_ENV = 'test';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.PUBLIC_APP_URL = 'http://localhost:3001';
process.env.MOCK_WEBHOOK_SECRET = 'test-mock-webhook-secret';
process.env.PAYMENT_HOLD_MINUTES = '15';
process.env.JWT_SECRET = 'test-jwt-secret';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://teaticket:secret@localhost:5432/teaticket_test';
}
