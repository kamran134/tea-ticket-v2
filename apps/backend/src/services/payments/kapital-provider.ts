import type { PaymentProvider } from './payment-provider';
import { assertAmountFormat, assertCurrency, formatAmount } from './decimal';
import type { CreatePaymentInput, CreatePaymentResult, ProviderPaymentState, ProviderPaymentStatus } from './types';

/**
 * Adapter for Kapital Bank's TXPG e-commerce gateway (Birbank retail brand).
 * Docs: https://pg.kapitalbank.az/docs (Basic Auth, no webhooks — status is
 * always confirmed by polling GET /order/{id}, never trusted from the HPP
 * browser redirect).
 */

export type KapitalOrderType = 'Order_SMS' | 'Order_DMS';

export interface KapitalConfig {
  /** Without a trailing slash, e.g. https://txpgtst.kapitalbank.az/api */
  apiBaseUrl: string;
  username: string;
  password: string;
  orderType: KapitalOrderType;
  language: string;
  timeoutMs: number;
}

export class KapitalApiError extends Error {
  constructor(
    readonly errorCode: string,
    readonly errorDescription: string,
    readonly httpStatus: number,
  ) {
    super(`Kapital API error ${errorCode} (HTTP ${httpStatus}): ${errorDescription}`);
    this.name = 'KapitalApiError';
  }
}

interface KapitalOrderCreateResponse {
  order?: {
    id: number | string;
    hppUrl: string;
    password: string;
    status: string;
    secret?: string;
  };
}

interface KapitalOrderTran {
  pmoResultCode?: string;
  type?: string;
  description?: string;
}

interface KapitalOrderDetailResponse {
  order: {
    id: number | string;
    status: string;
    amount: number | string;
    currency: string;
    finishTime?: string | null;
    createTime?: string;
    trans?: KapitalOrderTran[];
  };
}

interface KapitalErrorBody {
  errorCode?: string;
  errorDescription?: string;
}

export class KapitalProvider implements PaymentProvider {
  readonly name = 'kapital';
  readonly supportsWebhooks = false;

  private readonly authHeader: string;

  constructor(private readonly config: KapitalConfig) {
    this.authHeader = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    assertCurrency(input.currency);
    assertAmountFormat(input.amount);

    const json = await this.request<KapitalOrderCreateResponse>('POST', '/order', {
      order: {
        typeRid: this.config.orderType,
        amount: input.amount,
        currency: input.currency,
        language: this.config.language,
        title: 'Tea Ticket',
        description: input.description,
        hppRedirectUrl: input.returnUrl,
      },
    });

    const order = json.order;
    if (!order?.id || !order.hppUrl || !order.password) {
      throw new Error('Kapital create-order response is missing id, hppUrl or password');
    }

    return {
      providerPaymentId: String(order.id),
      // order.password is the auth token for the hosted payment page — never log this URL whole.
      redirectUrl: `${order.hppUrl}/flex?id=${order.id}&password=${encodeURIComponent(order.password)}`,
      status: this.mapStatus(order.status),
    };
  }

  // Kapital TXPG has no webhooks: intentionally not implemented. Status is
  // confirmed exclusively via getPaymentStatus() — see PaymentProvider.supportsWebhooks.

  async getPaymentStatus(providerPaymentId: string): Promise<ProviderPaymentState> {
    const json = await this.request<KapitalOrderDetailResponse>(
      'GET',
      `/order/${encodeURIComponent(providerPaymentId)}?tranDetailLevel=2&orderDetailLevel=2`,
    );

    const order = json.order;
    assertCurrency(order.currency);

    return {
      providerPaymentId: String(order.id),
      orderId: '', // Kapital doesn't store our order id — matched by providerPaymentId only.
      amount: formatAmount(order.amount),
      currency: 'AZN',
      status: this.mapStatus(order.status),
      paidAt: this.bakuTimeToIso(order.finishTime ?? null),
      failureCode: this.extractFailureCode(order),
    };
  }

  // cancelPayment / refundPayment intentionally not implemented in this iteration —
  // see TZ-KAPITAL-TXPG.md §A9.

  private mapStatus(status: string): ProviderPaymentStatus {
    switch (status) {
      case 'Preparing':
        return 'CREATED';
      case 'FullyPaid':
      case 'Refunded':
        return 'SUCCEEDED';
      case 'Declined':
        return 'FAILED';
      case 'Canceled':
        return 'CANCELLED';
      case 'Expired':
        return 'EXPIRED';
      default:
        // No public status table exists (pg.kapitalbank.az/docs ships the section empty).
        // Fail loudly instead of silently mapping to FAILED — a wrong guess here would
        // cancel a booking that was actually paid.
        throw new Error(`Unknown Kapital order status: ${status}`);
    }
  }

  /**
   * order.finishTime / createTime come back as "YYYY-MM-DD HH:mm:ss" with no timezone.
   * Assumed to be Asia/Baku (UTC+4) — unconfirmed with the bank, see TZ §A10 open question 3.
   */
  private bakuTimeToIso(value: string | null): string | null {
    if (!value) return null;
    const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(value);
    if (!match) return null;
    return `${match[1]}T${match[2]}+04:00`;
  }

  /**
   * No documented failure-code field on the order itself. Best-effort extraction from the
   * last non-approved transaction's pmoResultCode ("1" = approved). Unconfirmed — see A10.
   */
  private extractFailureCode(order: KapitalOrderDetailResponse['order']): string | null {
    const trans = order.trans;
    if (!trans || trans.length === 0) return null;
    const last = trans[trans.length - 1];
    if (!last.pmoResultCode || last.pmoResultCode === '1') return null;
    return `pmo:${last.pmoResultCode}`;
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.config.apiBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: this.authHeader,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new KapitalApiError('InvalidResponse', `HTTP ${res.status}: response was not JSON`, res.status);
    }

    const errorBody = json as KapitalErrorBody;
    // errorCode is checked before res.ok: Kapital returns business errors as both
    // HTTP 400 (e.g. bad credentials, bad currency) and HTTP 404 (e.g. unknown order id).
    if (errorBody?.errorCode) {
      throw new KapitalApiError(errorBody.errorCode, errorBody.errorDescription ?? '', res.status);
    }
    if (!res.ok) {
      throw new KapitalApiError('HttpError', `HTTP ${res.status}`, res.status);
    }

    return json as T;
  }
}

export function loadKapitalConfig(): KapitalConfig {
  const apiBaseUrl = process.env.KAPITAL_API_BASE_URL?.replace(/\/$/, '');
  const username = process.env.KAPITAL_USERNAME;
  const password = process.env.KAPITAL_PASSWORD;

  if (!apiBaseUrl || !username || !password) {
    throw new Error(
      'Kapital provider requires KAPITAL_API_BASE_URL, KAPITAL_USERNAME, KAPITAL_PASSWORD',
    );
  }

  const orderTypeRaw = process.env.KAPITAL_ORDER_TYPE ?? 'Order_SMS';
  if (orderTypeRaw !== 'Order_SMS' && orderTypeRaw !== 'Order_DMS') {
    throw new Error(`Unknown KAPITAL_ORDER_TYPE: ${orderTypeRaw}`);
  }

  const timeoutRaw = process.env.KAPITAL_TIMEOUT_MS;
  const timeoutParsed = timeoutRaw ? Number.parseInt(timeoutRaw, 10) : NaN;
  const timeoutMs = Number.isFinite(timeoutParsed) && timeoutParsed > 0 ? timeoutParsed : 15000;

  return {
    apiBaseUrl,
    username,
    password,
    orderType: orderTypeRaw,
    language: process.env.KAPITAL_LANGUAGE ?? 'az',
    timeoutMs,
  };
}
