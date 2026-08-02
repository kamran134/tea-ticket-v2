import type { PrismaClient } from '@prisma/client';
import { loadEmailConfig, type EmailConfig } from './config';
import { ConsoleEmailSender } from './console-email-sender';
import {
  createEmailJobProcessor,
  kickEmailJobProcessing,
  type EmailJobProcessor,
} from './email-job-processor';
import { ResendEmailSender } from './resend-email-sender';
import type { TicketEmailSender } from './types';

export function createTicketEmailSender(config: EmailConfig): TicketEmailSender {
  if (!config.enabled) {
    return new ConsoleEmailSender();
  }
  return new ResendEmailSender(config.apiKey, config.from, config.replyTo);
}

export function createEmailRuntime(
  prisma: PrismaClient,
  options?: {
    config?: EmailConfig;
    sender?: TicketEmailSender;
  },
): { config: EmailConfig; sender: TicketEmailSender; processor: EmailJobProcessor } {
  const config = options?.config ?? loadEmailConfig();
  const sender = options?.sender ?? createTicketEmailSender(config);
  const processor = createEmailJobProcessor(prisma, config, sender);
  return { config, sender, processor };
}

export {
  loadEmailConfig,
  kickEmailJobProcessing,
  createEmailJobProcessor,
  type EmailConfig,
  type EmailJobProcessor,
  type TicketEmailSender,
};
export { enqueueTicketConfirmedEmail } from './enqueue-ticket-email';
export {
  PermanentEmailError,
  TransientEmailError,
} from './types';
