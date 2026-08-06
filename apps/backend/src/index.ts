import dotenv from 'dotenv';
dotenv.config();

import './env';
import { createApp } from './app';
import { startCronJobs } from './services/cron';

const { app, prisma, paymentService, emailJobProcessor } = createApp();
const PORT = process.env.PORT ?? 3000;

startCronJobs({ prisma, paymentService, emailJobProcessor });

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
