import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { authRouter } from './routes/auth';
import { ticketsRouter } from './routes/tickets';
import { venuesRouter } from './routes/venues';
import { zonesRouter } from './routes/zones';
import { startCronJobs } from './services/cron';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/venues', venuesRouter);
app.use('/api/zones', zonesRouter);

startCronJobs();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
