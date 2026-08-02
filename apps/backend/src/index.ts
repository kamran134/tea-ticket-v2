import dotenv from 'dotenv';
import { createApp } from './app';
import { startCronJobs } from './services/cron';

dotenv.config();

const { app } = createApp();
const PORT = process.env.PORT ?? 3000;

startCronJobs();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
