import { Prisma } from '@prisma/client';
import type { EnqueueTicketEmailResult } from './types';

function pickRecipient(tickets: Array<{ email: string | null | undefined }>): string | null {
  for (const ticket of tickets) {
    const email = ticket.email?.trim().toLowerCase();
    if (email) return email;
  }
  return null;
}

/**
 * Creates a TICKET_CONFIRMED EmailJob in the same transaction as ticket confirmation.
 * Unique [type, checkoutId] makes duplicates a no-op.
 */
export async function enqueueTicketConfirmedEmail(
  tx: Prisma.TransactionClient,
  checkoutId: string,
  tickets: Array<{ email: string | null | undefined }>,
): Promise<EnqueueTicketEmailResult> {
  const recipient = pickRecipient(tickets);
  if (!recipient) {
    console.warn(`[email-job] skip enqueue checkout=${checkoutId} reason=no_email`);
    return { status: 'skipped', reason: 'no_email' };
  }

  try {
    const job = await tx.emailJob.create({
      data: {
        type: 'TICKET_CONFIRMED',
        checkoutId,
        recipient,
        status: 'PENDING',
      },
    });
    return { status: 'enqueued', jobId: job.id };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return { status: 'exists' };
    }
    throw err;
  }
}
