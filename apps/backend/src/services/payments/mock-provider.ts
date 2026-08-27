import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { IncomingHttpHeaders } from 'http';
import type { PaymentProvider } from './payment-provider';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  ProviderPaymentState,
  ProviderPaymentStatus,
  WebhookEvent,
} from './types';
import { assertAmountFormat, assertCurrency } from './decimal';

interface MockSession {
  providerPaymentId: string;
  orderId: string;
  amount: string;
  currency: 'AZN';
  description: string;
  returnUrl: string;
  webhookUrl: string;
  status: ProviderPaymentStatus;
  paidAt: string | null;
  failureCode: string | null;
  token: string;
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly supportsWebhooks = true;

  private readonly sessions = new Map<string, MockSession>();
  private readonly tokenByPaymentId = new Map<string, string>();

  constructor(
    private readonly publicAppUrl: string,
    private readonly webhookSecret: string,
  ) {}

  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    assertCurrency(input.currency);
    assertAmountFormat(input.amount);

    const providerPaymentId = `mock_${randomBytes(12).toString('hex')}`;
    const token = randomBytes(24).toString('hex');

    const session: MockSession = {
      providerPaymentId,
      orderId: input.orderId,
      amount: input.amount,
      currency: 'AZN',
      description: input.description,
      returnUrl: input.returnUrl,
      webhookUrl: input.webhookUrl,
      status: 'CREATED',
      paidAt: null,
      failureCode: null,
      token,
    };

    this.sessions.set(providerPaymentId, session);
    this.tokenByPaymentId.set(providerPaymentId, token);

    const redirectUrl = `${this.publicAppUrl}/api/mock-payments/${token}`;

    return Promise.resolve({
      providerPaymentId,
      redirectUrl,
      status: 'CREATED',
    });
  }

  verifyAndParseWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): WebhookEvent {
    const signature = this.extractSignature(headers);
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new Error('Invalid webhook signature');
    }

    const payload = JSON.parse(rawBody.toString('utf8')) as {
      eventId: string;
      event: string;
      paymentId: string;
      orderId: string;
      amount: string;
      currency: string;
      status: string;
      paidAt?: string | null;
      failureCode?: string | null;
    };

    assertCurrency(payload.currency);
    assertAmountFormat(payload.amount);

    const status = this.mapStatus(payload.status);

    return {
      providerEventId: payload.eventId,
      providerPaymentId: payload.paymentId,
      orderId: payload.orderId,
      amount: payload.amount,
      currency: 'AZN',
      status,
      paidAt: payload.paidAt ?? null,
      failureCode: payload.failureCode ?? null,
      rawPayload: payload,
    };
  }

  getPaymentStatus(providerPaymentId: string): Promise<ProviderPaymentState> {
    const session = this.sessions.get(providerPaymentId);
    if (!session) {
      throw new Error(`Mock payment not found: ${providerPaymentId}`);
    }
    return Promise.resolve(this.toState(session));
  }

  getSessionByToken(token: string): MockSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.token === token) {
        return session;
      }
    }
    return undefined;
  }

  simulateOutcome(
    token: string,
    outcome: 'success' | 'failure' | 'cancel',
  ): { webhookBody: string; signature: string; webhookUrl: string } {
    const session = this.getSessionByToken(token);
    if (!session) {
      throw new Error('Payment session not found');
    }

    const eventId = `mock_evt_${randomBytes(12).toString('hex')}`;
    const now = new Date().toISOString();

    if (outcome === 'success') {
      session.status = 'SUCCEEDED';
      session.paidAt = now;
      session.failureCode = null;
    } else if (outcome === 'failure') {
      session.status = 'FAILED';
      session.paidAt = null;
      session.failureCode = 'DECLINED';
    } else {
      session.status = 'CANCELLED';
      session.paidAt = null;
      session.failureCode = 'USER_CANCELLED';
    }

    const payload = {
      eventId,
      event: `payment.${outcome === 'success' ? 'succeeded' : outcome === 'failure' ? 'failed' : 'cancelled'}`,
      paymentId: session.providerPaymentId,
      orderId: session.orderId,
      amount: session.amount,
      currency: 'AZN',
      status: session.status,
      paidAt: session.paidAt,
      failureCode: session.failureCode,
    };

    const webhookBody = JSON.stringify(payload);
    const signature = createHmac('sha256', this.webhookSecret).update(webhookBody).digest('hex');

    return { webhookBody, signature, webhookUrl: session.webhookUrl };
  }

  buildReturnUrl(token: string): string {
    const session = this.getSessionByToken(token);
    if (!session) {
      throw new Error('Payment session not found');
    }
    const url = new URL(session.returnUrl);
    url.searchParams.set('paymentId', session.providerPaymentId);
    return url.toString();
  }

  signPayload(body: string): string {
    return createHmac('sha256', this.webhookSecret).update(body).digest('hex');
  }

  private extractSignature(headers: IncomingHttpHeaders): string {
    const header = headers['x-mock-payment-signature'];
    if (typeof header === 'string' && header.length > 0) {
      return header;
    }
    throw new Error('Missing webhook signature header');
  }

  private mapStatus(status: string): ProviderPaymentStatus {
    switch (status) {
      case 'CREATED':
        return 'CREATED';
      case 'PROCESSING':
        return 'PROCESSING';
      case 'SUCCEEDED':
      case 'PAID':
        return 'SUCCEEDED';
      case 'FAILED':
        return 'FAILED';
      case 'CANCELLED':
        return 'CANCELLED';
      case 'EXPIRED':
        return 'EXPIRED';
      default:
        throw new Error(`Unknown provider status: ${status}`);
    }
  }

  private toState(session: MockSession): ProviderPaymentState {
    return {
      providerPaymentId: session.providerPaymentId,
      orderId: session.orderId,
      amount: session.amount,
      currency: 'AZN',
      status: session.status,
      paidAt: session.paidAt,
      failureCode: session.failureCode,
    };
  }
}

export function getMockProvider(): MockPaymentProvider | null {
  const instance = globalThis.__mockPaymentProvider;
  return instance ?? null;
}

declare global {
  // eslint-disable-next-line no-var
  var __mockPaymentProvider: MockPaymentProvider | undefined;
}
