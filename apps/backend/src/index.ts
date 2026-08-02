import dotenv from 'dotenv';
dotenv.config();

import './env'; // validates required env vars at startup, before anything else runs

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { join } from 'path';
import { authRouter } from './routes/auth';
import { ticketsRouter } from './routes/tickets';
import { venuesRouter } from './routes/venues';
import { zonesRouter } from './routes/zones';
import { gridTemplatesRouter } from './routes/grid-templates';
import { startCronJobs } from './services/cron';

const app = express();
const PORT = process.env.PORT ?? 3000;
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? '/app/uploads';

// The app always sits behind nginx (see infra/nginx/tea-ticket.com.conf) —
// trust exactly one proxy hop so req.ip reflects the real client's address
// from X-Forwarded-For instead of nginx's own. Required for per-client rate
// limiting (routes/auth.ts) to work at all; without it every request looks
// like it comes from the same IP (the proxy), and one client's limit would
// be shared by everyone.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));
app.use(express.json({ limit: '10mb' }));
// Receipts (bank statements) are sensitive — served only through the
// authenticated GET /api/tickets/:id/receipt route, never as a static file at
// a guessable path. Posters/floor plans stay public via express.static below.
app.use('/uploads/receipts', (_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});
app.use('/uploads', express.static(join(UPLOADS_DIR)));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/venues', venuesRouter);
app.use('/api/zones', zonesRouter);
app.use('/api/grid-templates', gridTemplatesRouter);

startCronJobs();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
