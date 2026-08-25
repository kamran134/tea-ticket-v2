import {
  PaymentStatus,
  Prisma,
  PrismaClient,
  TicketStatus,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import type { IncomingHttpHeaders } from 'http';
import { amountsEqual, formatAmount, sumAmounts } from './decimal';
import type { PaymentProvider } from './payment-provider';
import type { ProviderPaymentState, ProviderPaymentStatus, WebhookEvent } from './types';

import { ACTIVE_PAYMENT_STATUSES, TERMINAL_PAYMENT_STATUSES } from './types';
import { expireStaleBookings as expireBookings, expireStalePayments as expirePayments } from '../booking-expiry';
import { enqueueTicketConfirmedEmail } from '../email';
import { ErrorCodes } from '../../errors';
import { logScope } from '../../middleware/requestId';

export { getBookingHoldMs, getPaymentHoldMs } from '../ttl';

const ACTIVE_TICKET_STATUSES: TicketStatus[] = ['BOOKED', 'PENDING', 'CONFIRMED'];

// Terminal provider-side statuses that end the "keep polling" loop in reconcile/sync.
// Distinct from TERMINAL_PAYMENT_STATUSES (DB enum, includes REQUIRES_REVIEW which
// has no provider-side equivalent).
const PROVIDER_TERMINAL_STATUSES: readonly ProviderPaymentStatus[] = [
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
];

const SYNC_THROTTLE_MS = 2000;

export interface PaymentServiceDeps {
  prisma: PrismaClient;
  provider: PaymentProvider;
  publicAppUrl: string;
  webhookBaseUrl: string;
  paymentHoldMs: number;
}

export interface CreatePaymentResponse {
  paymentId: string;
  redirectUrl: string;
  status: PaymentStatus;
  amount: string;
  expiresAt: string | null;
  returnToken: string;
}

export interface PaymentStatusResponse {
  paymentId: string;
  status: PaymentStatus;
  amount: string;
  paidAt: string | null;
  failureCode: string | null;
  ticketStatus: TicketStatus | null;
  ticketsConfirmed: boolean;
}

export class PaymentService {
  // Per-payment throttle for syncFromProvider, so a poll-happy frontend can't hammer
  // the bank API. In-memory only — fine for a single instance; see TZ §A7(д) if this
  // ever needs to survive across instances (would need a lastSyncedAt DB column instead).
  private readonly lastSyncAttempt = new Map<string, number>();

  constructor(private readonly deps: PaymentServiceDeps) {}

  async createPaymentForTicket(ticketId: string): Promise<CreatePaymentResponse> {
    const ticket = await this.deps.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      throw new PaymentError(404, 'Ticket not found', ErrorCodes.TICKET_NOT_FOUND);
    }
    if (ticket.status === 'CONFIRMED') {
      throw new PaymentError(409, 'Payment already completed', ErrorCodes.PAYMENT_ALREADY_COMPLETED);
    }
    if (ticket.status !== 'BOOKED') {
      throw new PaymentError(409, 'Ticket is not available for payment', ErrorCodes.VALIDATION_ERROR);
    }
    if (ticket.expiresAt && ticket.expiresAt <= new Date()) {
      throw new PaymentError(409, 'Booking has expired');
    }

    const checkoutId = ticket.groupId ?? ticket.id;
    const tickets = await this.getCheckoutTickets(checkoutId);
    if (tickets.some(t => t.status !== 'BOOKED')) {
      throw new PaymentError(409, 'Checkout is not in payable state');
    }

    const existing = await this.deps.prisma.payment.findFirst({
      where: {
        checkoutId,
        status: { in: [...ACTIVE_PAYMENT_STATUSES] },
      },
    });
    if (existing) {
      return this.toCreateResponse(existing);
    }

    const amount = sumAmounts(tickets.map(t => t.price));
    const holdMs = this.deps.paymentHoldMs;
    const ticketExpiresAt = tickets[0].expiresAt ?? new Date(Date.now() + holdMs);
    const paymentExpiresAt = new Date(Math.min(ticketExpiresAt.getTime(), Date.now() + holdMs));

    const idempotencyKey = `checkout:${checkoutId}:${randomBytes(8).toString('hex')}`;
    const returnToken = randomBytes(24).toString('hex');

    const payment = await this.deps.prisma.payment.create({
      data: {
        checkoutId,
        provider: this.deps.provider.name,
        idempotencyKey,
        amount,
        status: 'CREATED',
        returnToken,
        expiresAt: paymentExpiresAt,
      },
    });

    try {
      const providerResult = await this.deps.provider.createPayment({
        orderId: payment.id,
        amount,
        currency: 'AZN',
        description: `Tea Ticket checkout ${checkoutId}`,
        returnUrl: `${this.deps.publicAppUrl}/api/payments/return/${returnToken}`,
        webhookUrl: `${this.deps.webhookBaseUrl}/api/webhooks/payments/${this.deps.provider.name}`,
      });

      const updated = await this.deps.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: providerResult.providerPaymentId,
          redirectUrl: providerResult.redirectUrl,
          status: this.mapProviderStatusToDb(providerResult.status),
        },
      });

      return this.toCreateResponse(updated);
    } catch (err) {
      await this.deps.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', failureCode: 'PROVIDER_ERROR' },
      });
      throw err;
    }
  }

  async getReturnRedirect(returnToken: string): Promise<string> {
    const payment = await this.deps.prisma.payment.findUnique({
      where: { returnToken },
    });
    if (!payment) {
      throw new PaymentError(404, 'Return token not found', ErrorCodes.PAYMENT_NOT_FOUND);
    }

    // Best-effort: sync status now so the first status poll after the redirect already
    // sees the outcome, instead of waiting for the next cron tick. Never let a failure
    // here break the redirect itself.
    //
    // Note: the bank appends its own ?ID=&STATUS= to this return URL. Those are NOT read
    // here or anywhere else — they arrive via the user's browser and are trivially
    // forgeable. The payment is identified solely by returnToken from the path. The bank's
    // docs themselves warn STATUS can be stale; GET /order/{id} is the only source of truth.
    try {
      await this.syncFromProvider(payment.id);
    } catch (err) {
      console.error(`[return] sync failed for payment ${payment.id}:`, err);
    }

    const frontendUrl = process.env.PUBLIC_FRONTEND_URL ?? process.env.PUBLIC_APP_URL ?? 'http://localhost:5173';
    const url = new URL(`${frontendUrl}/ticket`);
    url.searchParams.set('id', payment.checkoutId);
    url.searchParams.set('paymentId', payment.id);
    url.searchParams.set('returnToken', returnToken);
    url.searchParams.set('checkoutId', payment.checkoutId);
    return url.toString();
  }

  async getPaymentStatus(paymentId: string, returnToken?: string): Promise<PaymentStatusResponse> {
    let payment = await this.deps.prisma.payment.findFirst({
      where: returnToken ? { id: paymentId, returnToken } : { id: paymentId },
    });
    if (!payment) {
      throw new PaymentError(404, 'Payment not found', ErrorCodes.PAYMENT_NOT_FOUND);
    }

    // Providers without webhooks (Kapital TXPG) never push us an update — this poll
    // endpoint is the only place status gets refreshed after the user returns from the
    // hosted payment page. Throttled internally (syncFromProvider), safe on every call.
    if (
      !this.deps.provider.supportsWebhooks &&
      !(TERMINAL_PAYMENT_STATUSES as readonly string[]).includes(payment.status)
    ) {
      await this.syncFromProvider(payment.id);
      payment = (await this.deps.prisma.payment.findUnique({ where: { id: payment.id } })) ?? payment;
    }

    const tickets = await this.getCheckoutTickets(payment.checkoutId);
    const mainTicket = tickets[0];
    const ticketsConfirmed = tickets.every(t => t.status === 'CONFIRMED');

    return {
      paymentId: payment.id,
      status: payment.status,
      amount: formatAmount(payment.amount),
      paidAt: payment.paidAt?.toISOString() ?? null,
      failureCode: payment.failureCode,
      ticketStatus: mainTicket?.status ?? null,
      ticketsConfirmed,
    };
  }

  async handleWebhook(
    providerName: string,
    rawBody: Buffer,
    headers: IncomingHttpHeaders,
  ): Promise<{ processed: boolean; paymentId?: string }> {
    if (providerName !== this.deps.provider.name) {
      throw new PaymentError(404, 'Unknown payment provider');
    }
    if (!this.deps.provider.supportsWebhooks || !this.deps.provider.verifyAndParseWebhook) {
      throw new PaymentError(404, 'Provider does not support webhooks');
    }

    let event: WebhookEvent;
    try {
      event = this.deps.provider.verifyAndParseWebhook(rawBody, headers);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid webhook';
      if (/signature/i.test(message)) {
        throw new PaymentError(400, 'Invalid webhook signature', ErrorCodes.INVALID_WEBHOOK_SIGNATURE);
      }
      throw new PaymentError(400, message, ErrorCodes.VALIDATION_ERROR);
    }

    logScope('webhook', 'payment webhook received', {
      provider: providerName,
      providerEventId: event.providerEventId,
      orderId: event.orderId,
      status: event.status,
    });

    const existingEvent = await this.deps.prisma.paymentWebhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: providerName,
          providerEventId: event.providerEventId,
        },
      },
    });
    if (existingEvent?.processedAt) {
      logScope('webhook', 'duplicate webhook ignored', {
        providerEventId: event.providerEventId,
        paymentId: existingEvent.paymentId,
      });
      return { processed: false, paymentId: existingEvent.paymentId ?? undefined };
    }

    const payment = await this.deps.prisma.payment.findFirst({
      where: {
        OR: [
          { id: event.orderId },
          { providerPaymentId: event.providerPaymentId },
        ],
      },
    });
    if (!payment) {
      throw new PaymentError(404, 'Payment not found for webhook', ErrorCodes.PAYMENT_NOT_FOUND);
    }

    if (!amountsEqual(formatAmount(payment.amount), event.amount)) {
      throw new PaymentError(400, 'Webhook amount mismatch', ErrorCodes.PAYMENT_AMOUNT_MISMATCH);
    }

    await this.deps.prisma.paymentWebhookEvent.upsert({
      where: {
        provider_providerEventId: {
          provider: providerName,
          providerEventId: event.providerEventId,
        },
      },
      create: {
        provider: providerName,
        providerEventId: event.providerEventId,
        paymentId: payment.id,
        payload: event.rawPayload as Prisma.InputJsonValue,
      },
      update: {},
    });

    await this.applyWebhookEvent(payment.id, event);

    await this.deps.prisma.paymentWebhookEvent.update({
      where: {
        provider_providerEventId: {
          provider: providerName,
          providerEventId: event.providerEventId,
        },
      },
      data: { processedAt: new Date(), paymentId: payment.id },
    });

    return { processed: true, paymentId: payment.id };
  }

  async expireStaleBookings(): Promise<number> {
    return expireBookings(this.deps.prisma);
  }

  async expireStalePayments(): Promise<number> {
    return expirePayments(this.deps.prisma);
  }

  /**
   * Renamed from reconcileProcessingPayments: the old filter only looked at status
   * PROCESSING, which a webhook-only provider transitions into but Kapital never does —
   * its orders sit in CREATED until confirmed. Without this broadened filter, a Kapital
   * payment abandoned mid-flow (browser closed on the HPP) would never get picked up
   * by the cron and would sit unconfirmed forever. See TZ-KAPITAL-TXPG.md §A7(б).
   */
  async reconcilePendingPayments(): Promise<number> {
    const pending = await this.deps.prisma.payment.findMany({
      where: {
        status: { in: ['CREATED', 'PROCESSING'] },
        providerPaymentId: { not: null },
      },
    });

    let count = 0;
    for (const payment of pending) {
      if (!payment.providerPaymentId) continue;
      try {
        const state = await this.deps.provider.getPaymentStatus(payment.providerPaymentId);
        if (PROVIDER_TERMINAL_STATUSES.includes(state.status)) {
          await this.applyProviderState(payment.id, state);
          count++;
        }
      } catch (err) {
        console.error(`[reconcile] payment ${payment.id}:`, err);
      }
    }
    return count;
  }

  /**
   * Single-payment counterpart to reconcilePendingPayments, used by getPaymentStatus and
   * getReturnRedirect so a webhook-less provider's status is refreshed synchronously on
   * request instead of waiting up to 10 minutes for the next cron tick. Throttled per
   * payment (SYNC_THROTTLE_MS) so a poll-happy frontend can't hammer the bank API.
   */
  private async syncFromProvider(paymentId: string): Promise<void> {
    const now = Date.now();
    const last = this.lastSyncAttempt.get(paymentId) ?? 0;
    if (now - last < SYNC_THROTTLE_MS) {
      return;
    }
    this.lastSyncAttempt.set(paymentId, now);
    if (this.lastSyncAttempt.size > 10_000) {
      for (const [id, ts] of this.lastSyncAttempt) {
        if (now - ts > 60_000) this.lastSyncAttempt.delete(id);
      }
    }

    const payment = await this.deps.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || !payment.providerPaymentId) return;
    if ((TERMINAL_PAYMENT_STATUSES as readonly string[]).includes(payment.status)) return;

    try {
      const state = await this.deps.provider.getPaymentStatus(payment.providerPaymentId);
      if (PROVIDER_TERMINAL_STATUSES.includes(state.status)) {
        await this.applyProviderState(paymentId, state);
      }
    } catch (err) {
      console.error(`[sync] payment ${paymentId}:`, err);
    }
  }

  private async applyWebhookEvent(paymentId: string, event: WebhookEvent): Promise<void> {
    await this.deps.prisma.$transaction(async tx => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) return;

      if ((TERMINAL_PAYMENT_STATUSES as readonly string[]).includes(payment.status)) {
        return;
      }

      const dbStatus = this.mapProviderStatusToDb(event.status);

      if (dbStatus === 'SUCCEEDED') {
        await this.confirmCheckoutOnSuccess(tx, payment.checkoutId, payment.id, event.paidAt);
        return;
      }

      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: dbStatus,
          failureCode: event.failureCode,
          paidAt: event.paidAt ? new Date(event.paidAt) : null,
        },
      });
    });
  }

  /**
   * Was previously blind to the amount the provider actually reported: it discarded
   * state.amount and always substituted the DB's own amount before handing off to
   * applyWebhookEvent, which itself does no amount check on the reconcile path (only
   * handleWebhook's real-webhook path validates amount, at line ~199). That was tolerable
   * while every provider spoke webhooks and that check ran; for Kapital this reconcile/sync
   * path is the *only* path, so the amount check has to live here now. See TZ §A7(в).
   */
  private async applyProviderState(paymentId: string, state: ProviderPaymentState): Promise<void> {
    const payment = await this.deps.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return;
    if (payment.status === 'SUCCEEDED' || payment.status === 'REQUIRES_REVIEW') return;

    if (!amountsEqual(formatAmount(payment.amount), state.amount)) {
      // Money may have already moved on the bank's side — this is for a human to look
      // at, not for us to guess and either confirm a short payment or cancel a paid one.
      console.error(
        `[reconcile] amount mismatch for payment ${paymentId}: db=${formatAmount(payment.amount)} provider=${state.amount}`,
      );
      await this.deps.prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'REQUIRES_REVIEW', failureCode: 'AMOUNT_MISMATCH' },
      });
      return;
    }

    const event: WebhookEvent = {
      providerEventId: `reconcile_${paymentId}_${Date.now()}`,
      providerPaymentId: payment.providerPaymentId ?? '',
      orderId: paymentId,
      amount: state.amount,
      currency: 'AZN',
      status: state.status,
      paidAt: state.paidAt,
      failureCode: state.failureCode,
      rawPayload: { source: 'reconciliation' },
    };

    await this.applyWebhookEvent(paymentId, event);
  }

  private async confirmCheckoutOnSuccess(
    tx: Prisma.TransactionClient,
    checkoutId: string,
    paymentId: string,
    paidAt: string | null,
  ): Promise<void> {
    const tickets = await tx.ticket.findMany({
      where: {
        OR: [{ id: checkoutId }, { groupId: checkoutId }],
      },
    });
    const now = paidAt ? new Date(paidAt) : new Date();

    const allBooked = tickets.every(t => t.status === 'BOOKED');
    const hasExpired = tickets.some(t => t.status === 'EXPIRED');
    const hasConfirmedByOther = tickets.some(
      t => t.status === 'CONFIRMED' && t.confirmationSource !== 'PAYMENT',
    );

    if (!allBooked || hasExpired) {
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'REQUIRES_REVIEW',
          paidAt: now,
        },
      });
      return;
    }

    if (hasConfirmedByOther) {
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'REQUIRES_REVIEW',
          paidAt: now,
        },
      });
      return;
    }

    const inventoryOk = await this.checkInventoryAvailable(tx, tickets);
    if (!inventoryOk) {
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'REQUIRES_REVIEW',
          paidAt: now,
        },
      });
      return;
    }

    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: 'SUCCEEDED',
        paidAt: now,
      },
    });

    const updated = await tx.ticket.updateMany({
      where: {
        OR: [{ id: checkoutId }, { groupId: checkoutId }],
        status: 'BOOKED',
      },
      data: {
        status: 'CONFIRMED',
        confirmationSource: 'PAYMENT',
        confirmedAt: now,
      },
    });

    if (updated.count > 0) {
      await enqueueTicketConfirmedEmail(tx, checkoutId, tickets);
    }
  }

  private async checkInventoryAvailable(
    tx: Prisma.TransactionClient,
    tickets: Array<{ id: string; seatId: string | null; tableId: string | null; zoneId: string }>,
  ): Promise<boolean> {
    for (const ticket of tickets) {
      if (ticket.seatId) {
        const conflict = await tx.ticket.findFirst({
          where: {
            seatId: ticket.seatId,
            status: { in: ACTIVE_TICKET_STATUSES },
            id: { not: ticket.id },
          },
        });
        if (conflict) return false;
      }
    }
    return true;
  }

  private async getCheckoutTickets(checkoutId: string) {
    return this.deps.prisma.ticket.findMany({
      where: {
        OR: [{ id: checkoutId }, { groupId: checkoutId }],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private mapProviderStatusToDb(status: ProviderPaymentStatus): PaymentStatus {
    switch (status) {
      case 'CREATED':
        return 'CREATED';
      case 'PROCESSING':
        return 'PROCESSING';
      case 'SUCCEEDED':
        return 'SUCCEEDED';
      case 'FAILED':
        return 'FAILED';
      case 'CANCELLED':
        return 'CANCELLED';
      case 'EXPIRED':
        return 'EXPIRED';
      default:
        return 'FAILED';
    }
  }

  private toCreateResponse(payment: {
    id: string;
    redirectUrl: string | null;
    status: PaymentStatus;
    amount: Prisma.Decimal;
    expiresAt: Date | null;
    returnToken: string;
  }): CreatePaymentResponse {
    if (!payment.redirectUrl) {
      throw new PaymentError(500, 'Payment redirect URL is missing');
    }
    return {
      paymentId: payment.id,
      redirectUrl: payment.redirectUrl,
      status: payment.status,
      amount: formatAmount(payment.amount),
      expiresAt: payment.expiresAt?.toISOString() ?? null,
      returnToken: payment.returnToken,
    };
  }
}

export class PaymentError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string = ErrorCodes.INTERNAL_ERROR,
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

export function resolveCheckoutId(ticket: { id: string; groupId: string | null }): string {
  return ticket.groupId ?? ticket.id;
}
