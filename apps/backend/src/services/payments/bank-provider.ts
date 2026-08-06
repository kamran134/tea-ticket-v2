import { createHmac, timingSafeEqual } from 'crypto';
import type { IncomingHttpHeaders } from 'http';
import type { PaymentProvider } from './payment-provider';
import { assertAmountFormat, assertCurrency } from './decimal';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  ProviderPaymentState,
  ProviderPaymentStatus,
  WebhookEvent,
} from './types';

interface BankApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Adapter for BirManatBank simulator (and future real bank API with the same contract).
 */
export class BankProvider implements PaymentProvider {
  readonly name = 'bank';

  constructor(
    private readonly apiBaseUrl: string,
    private readonly apiToken: string,
    private readonly webhookSecret: string,
  ) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const res = await fetch(`${this.apiBaseUrl}/api/v1/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orderId: input.orderId,
        amount: input.amount,
        currency: input.currency,
        description: input.description,
        returnUrl: input.returnUrl,
        webhookUrl: input.webhookUrl,
      }),
    });

    const json = (await res.json()) as BankApiResponse<{
      paymentId: string;
      status: string;
      paymentUrl: string;
    }>;

    if (!res.ok || !json.success || !json.data) {
      throw new Error(json.error ?? `Bank API error: HTTP ${res.status}`);
    }

    return {
      providerPaymentId: json.data.paymentId,
      redirectUrl: json.data.paymentUrl,
      status: this.mapApiStatus(json.data.status),
    };
  }

  verifyAndParseWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): WebhookEvent {
    const signature = this.extractHeader(headers, 'x-birmanatbank-signature');
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    this.assertSignature(signature, expected);

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

    const eventId =
      this.extractHeaderOptional(headers, 'x-birmanatbank-event-id') ?? payload.eventId;

    return {
      providerEventId: eventId,
      providerPaymentId: payload.paymentId,
      orderId: payload.orderId,
      amount: payload.amount,
      currency: 'AZN',
      status: this.mapApiStatus(payload.status),
      paidAt: payload.paidAt ?? null,
      failureCode: payload.failureCode ?? null,
      rawPayload: payload,
    };
  }

  async getPaymentStatus(providerPaymentId: string): Promise<ProviderPaymentState> {
    const res = await fetch(
      `${this.apiBaseUrl}/api/v1/payments/${encodeURIComponent(providerPaymentId)}`,
      {
        headers: { Authorization: `Bearer ${this.apiToken}` },
      },
    );

    const json = (await res.json()) as BankApiResponse<{
      paymentId: string;
      orderId: string;
      amount: string;
      currency: string;
      status: string;
      paidAt: string | null;
    }>;

    if (!res.ok || !json.success || !json.data) {
      throw new Error(json.error ?? `Bank API error: HTTP ${res.status}`);
    }

    const data = json.data;
    assertCurrency(data.currency);

    return {
      providerPaymentId: data.paymentId,
      orderId: data.orderId,
      amount: data.amount,
      currency: 'AZN',
      status: this.mapApiStatus(data.status),
      paidAt: data.paidAt,
      failureCode: null,
    };
  }

  private mapApiStatus(status: string): ProviderPaymentStatus {
    switch (status.toUpperCase()) {
      case 'CREATED':
        return 'CREATED';
      case 'PROCESSING':
        return 'PROCESSING';
      case 'PAID':
      case 'SUCCEEDED':
        return 'SUCCEEDED';
      case 'FAILED':
        return 'FAILED';
      case 'CANCELLED':
        return 'CANCELLED';
      case 'EXPIRED':
        return 'EXPIRED';
      default:
        throw new Error(`Unknown bank status: ${status}`);
    }
  }

  private extractHeader(headers: IncomingHttpHeaders, name: string): string {
    const value = this.extractHeaderOptional(headers, name);
    if (!value) {
      throw new Error(`Missing header: ${name}`);
    }
    return value;
  }

  private extractHeaderOptional(headers: IncomingHttpHeaders, name: string): string | undefined {
    const raw = headers[name];
    if (typeof raw === 'string' && raw.length > 0) {
      return raw;
    }
    return undefined;
  }

  private assertSignature(actual: string, expected: string): void {
    const actualBuf = Buffer.from(actual, 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
      throw new Error('Invalid webhook signature');
    }
  }
}

export function loadBankProviderConfig(): {
  apiBaseUrl: string;
  apiToken: string;
  webhookSecret: string;
} {
  const apiBaseUrl = process.env.BANK_API_BASE_URL?.replace(/\/$/, '');
  const apiToken = process.env.BANK_API_KEY ?? process.env.BIRMANAT_BANK_API_TOKEN;
  const webhookSecret =
    process.env.BANK_WEBHOOK_SECRET ?? process.env.BIRMANAT_BANK_WEBHOOK_SECRET;

  if (!apiBaseUrl || !apiToken || !webhookSecret) {
    throw new Error(
      'Bank provider requires BANK_API_BASE_URL, BANK_API_KEY (or BIRMANAT_BANK_API_TOKEN), ' +
        'BANK_WEBHOOK_SECRET (or BIRMANAT_BANK_WEBHOOK_SECRET)',
    );
  }

  return { apiBaseUrl, apiToken, webhookSecret };
}
