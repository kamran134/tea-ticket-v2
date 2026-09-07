import dotenv from 'dotenv';
dotenv.config();

import './env';
import { createApp } from './app';
import { startCronJobs } from './services/cron';
import { ensureBootstrapAdmin } from './services/bootstrap-admin';

const { app, prisma, paymentService, emailJobProcessor } = createApp();
const PORT = process.env.PORT ?? 3000;

startCronJobs({ prisma, paymentService, emailJobProcessor });

// Seeds the preset roles and, on a fresh database, the first Super Admin.
// Failing here would leave the admin panel unusable, so refuse to start.
ensureBootstrapAdmin(prisma)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err: unknown) => {
    console.error('Failed to bootstrap admin accounts:', err);
    process.exit(1);
  });
