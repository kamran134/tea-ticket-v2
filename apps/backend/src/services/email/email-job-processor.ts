import { EmailJobStatus, PrismaClient } from '@prisma/client';
import QRCode from 'qrcode';
import type { EmailConfig } from './config';
import { renderTicketConfirmedEmail } from './ticket-email-template';
import {
  PermanentEmailError,
  TransientEmailError,
  type TicketEmailSender,
} from './types';

const BATCH_SIZE = 10;
const CONCURRENCY = 3;
const STALE_LOCK_MS = 10 * 60 * 1000;

const RETRY_DELAYS_MS = [
  60_000, // 1st error
  5 * 60_000, // 2nd
  15 * 60_000, // 3rd
  60 * 60_000, // 4th
];

export interface EmailJobProcessor {
  processBatch(): Promise<{ processed: number }>;
}

export function createEmailJobProcessor(
  prisma: PrismaClient,
  config: EmailConfig,
  sender: TicketEmailSender,
): EmailJobProcessor {
  let running = false;

  async function recoverStaleLocks(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_LOCK_MS);
    const result = await prisma.emailJob.updateMany({
      where: {
        status: 'PROCESSING',
        lockedAt: { lt: cutoff },
      },
      data: {
        status: 'PENDING',
        lockedAt: null,
      },
    });
    if (result.count > 0) {
      console.log(`[email-job] recovered stale locks count=${result.count}`);
    }
  }

  async function claimNext(): Promise<{ id: string } | null> {
    const now = new Date();
    const candidates = await prisma.emailJob.findMany({
      where: {
        status: 'PENDING',
        nextAttemptAt: { lte: now },
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: BATCH_SIZE,
      select: { id: true, status: true },
    });

    for (const candidate of candidates) {
      const claimed = await prisma.emailJob.updateMany({
        where: { id: candidate.id, status: 'PENDING' },
        data: {
          status: 'PROCESSING',
          lockedAt: now,
          attempts: { increment: 1 },
        },
      });
      if (claimed.count === 1) {
        return { id: candidate.id };
      }
    }
    return null;
  }

  async function processOne(jobId: string): Promise<void> {
    const job = await prisma.emailJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== 'PROCESSING') return;

    console.log(
      `[email-job] claimed job=${job.id} checkout=${job.checkoutId} attempt=${job.attempts}`,
    );

    try {
      const tickets = await prisma.ticket.findMany({
        where: {
          OR: [{ id: job.checkoutId }, { groupId: job.checkoutId }],
        },
        include: {
          venue: true,
          seat: true,
          table: true,
          zone: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      if (tickets.length === 0) {
        throw new PermanentEmailError('Checkout tickets not found', 'MISSING_TICKETS');
      }
      if (tickets.some(t => t.status !== 'CONFIRMED')) {
        throw new PermanentEmailError('Not all tickets are confirmed', 'NOT_CONFIRMED');
      }

      const ticketUrl = `${config.publicFrontendUrl}/ticket?id=${encodeURIComponent(job.checkoutId)}`;
      const seatLabels = tickets
        .filter(t => t.seat)
        .map(t => t.seat!.label ?? String(t.seat!.number));
      const table = tickets.find(t => t.table)?.table ?? null;
      const totalAmount = tickets.reduce((sum, t) => sum + t.price, 0);

      const rendered = renderTicketConfirmedEmail({
        checkoutId: job.checkoutId,
        ticketUrl,
        eventName: tickets[0].venue.name,
        eventDate: tickets[0].venue.date,
        buyerName: tickets[0].name,
        zoneName: tickets[0].zoneName || tickets[0].zone.name,
        seatLabels,
        tableLabel: table ? String(table.number) : null,
        ticketCount: tickets.length,
        totalAmount,
        currency: tickets[0].venue.currency,
        supportEmail: config.replyTo,
      });

      const qrPng = await QRCode.toBuffer(job.checkoutId, {
        type: 'png',
        width: 320,
        margin: 2,
        errorCorrectionLevel: 'M',
      });

      const { providerMessageId } = await sender.send({
        jobId: job.id,
        checkoutId: job.checkoutId,
        recipient: job.recipient,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        qrPng,
        replyTo: config.replyTo,
      });

      await prisma.emailJob.update({
        where: { id: job.id },
        data: {
          status: 'ACCEPTED',
          providerMessageId,
          acceptedAt: new Date(),
          lockedAt: null,
          lastError: null,
        },
      });
      console.log(
        `[email-job] accepted job=${job.id} providerMessageId=${providerMessageId}`,
      );
    } catch (err) {
      await handleFailure(job.id, job.attempts, err);
    }
  }

  async function handleFailure(jobId: string, attempts: number, err: unknown): Promise<void> {
    const permanent = err instanceof PermanentEmailError;
    const code =
      err instanceof PermanentEmailError || err instanceof TransientEmailError
        ? err.code
        : 'UNKNOWN';
    const safeMessage = code;

    if (permanent || attempts >= config.maxAttempts) {
      await prisma.emailJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          lockedAt: null,
          lastError: safeMessage.slice(0, 500),
        },
      });
      console.error(
        `[email-job] failed job=${jobId} attempts=${attempts} reason=${safeMessage}`,
      );
      return;
    }

    const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];
    const nextAttemptAt = new Date(Date.now() + delay);
    await prisma.emailJob.update({
      where: { id: jobId },
      data: {
        status: 'PENDING' satisfies EmailJobStatus,
        lockedAt: null,
        nextAttemptAt,
        lastError: safeMessage.slice(0, 500),
      },
    });
    console.warn(
      `[email-job] retry job=${jobId} attempt=${attempts} nextAttemptAt=${nextAttemptAt.toISOString()} reason=${safeMessage}`,
    );
  }

  async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
    let index = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const current = items[index++];
        await fn(current);
      }
    });
    await Promise.all(workers);
  }

  return {
    async processBatch(): Promise<{ processed: number }> {
      if (running) {
        return { processed: 0 };
      }
      running = true;
      try {
        await recoverStaleLocks();

        const claimed: string[] = [];
        for (let i = 0; i < BATCH_SIZE; i++) {
          const next = await claimNext();
          if (!next) break;
          claimed.push(next.id);
        }

        if (claimed.length === 0) {
          return { processed: 0 };
        }

        await mapPool(claimed, CONCURRENCY, processOne);
        return { processed: claimed.length };
      } finally {
        running = false;
      }
    },
  };
}

export function kickEmailJobProcessing(processor: EmailJobProcessor): void {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  setImmediate(() => {
    void processor.processBatch().catch(err => {
      console.error('[email-job] post-response processing failed', err);
    });
  });
}
