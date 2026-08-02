import { Prisma, PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';
import { Resend } from 'resend';
import type { EmailConfig } from '../services/email';

type ResendEventLike = {
  type: string;
  created_at?: string;
  data?: { email_id?: string };
};

export function createResendWebhookHandler(
  prisma: PrismaClient,
  config: EmailConfig,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const rawBody = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody)) {
      res.status(400).json({ success: false, error: 'Expected raw body' });
      return;
    }

    if (!config.webhookSecret) {
      console.error('[email-webhook] RESEND_WEBHOOK_SECRET is not configured');
      res.status(500).json({ success: false, error: 'Webhook not configured' });
      return;
    }

    const svixId = req.header('svix-id');
    const svixTimestamp = req.header('svix-timestamp');
    const svixSignature = req.header('svix-signature');
    if (!svixId || !svixTimestamp || !svixSignature) {
      res.status(401).json({ success: false, error: 'Missing webhook signature headers' });
      return;
    }

    const payload = rawBody.toString('utf8');
    let event: ResendEventLike;
    try {
      const resend = new Resend(config.apiKey || 're_webhook_verify_only');
      event = resend.webhooks.verify({
        payload,
        headers: {
          id: svixId,
          timestamp: svixTimestamp,
          signature: svixSignature,
        },
        webhookSecret: config.webhookSecret,
      }) as ResendEventLike;
    } catch (err) {
      console.warn('[email-webhook] invalid signature');
      res.status(401).json({ success: false, error: 'Invalid webhook signature' });
      return;
    }

    const providerEventId = svixId;
    const eventType = event.type ?? 'unknown';
    const providerMessageId = event.data?.email_id;

    console.log(
      `[email-webhook] event=${eventType} providerMessageId=${providerMessageId ?? 'none'}`,
    );

    try {
      try {
        await prisma.emailWebhookEvent.create({
          data: {
            providerEventId,
            type: eventType,
            payload: JSON.parse(payload) as Prisma.InputJsonValue,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          res.status(200).json({ success: true, data: { duplicate: true } });
          return;
        }
        throw err;
      }

      if (
        providerMessageId &&
        (eventType === 'email.delivered' ||
          eventType === 'email.bounced' ||
          eventType === 'email.complained')
      ) {
        const job = await prisma.emailJob.findUnique({
          where: { providerMessageId },
        });
        if (job) {
          const now = new Date();
          if (eventType === 'email.delivered') {
            await prisma.emailJob.update({
              where: { id: job.id },
              data: {
                status: 'DELIVERED',
                deliveredAt: now,
              },
            });
          } else if (eventType === 'email.bounced') {
            await prisma.emailJob.update({
              where: { id: job.id },
              data: { status: 'BOUNCED' },
            });
          } else if (eventType === 'email.complained') {
            await prisma.emailJob.update({
              where: { id: job.id },
              data: { status: 'COMPLAINED' },
            });
          }
        }
      }

      await prisma.emailWebhookEvent.update({
        where: { providerEventId },
        data: { processedAt: new Date() },
      });

      res.status(200).json({ success: true });
    } catch (err) {
      console.error('[email-webhook] processing failed', err);
      res.status(500).json({ success: false, error: 'Webhook processing failed' });
    }
  };
}
