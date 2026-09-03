import type { PaymentProvider } from './payment-provider';
import { assertAmountFormat, assertCurrency, formatAmount } from './decimal';
import type { CreatePaymentInput, CreatePaymentResult, ProviderPaymentState, ProviderPaymentStatus } from './types';
import { describePmoResultCode, isPmoApproval } from './pmo-decline-codes';

/**
 * Adapter for Kapital Bank's TXPG e-commerce gateway (Birbank retail brand).
 * Docs:
 *   - https://pg.kapitalbank.az/docs (the original SPA)
 *   - https://brawny-airport-7ca.notion.site/Kapital-bank-E-commerce-API-Documentation-6dd6a228c40644e3bef034bca7845e3c
 *     (fuller English copy; the order-status, error-code and PmoDecline tables
 *     are filled in here where the SPA shipped them empty)
 * Basic Auth, no webhooks — status is always confirmed by polling
 * GET /order/{id}, never trusted from the HPP browser redirect.
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
      redirectUrl: `${this.hppBase(order.hppUrl)}?id=${order.id}&password=${encodeURIComponent(order.password)}`,
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

  /**
   * The docs show the redirect as `{{order.hppUrl}}/flex?id=...`, but the API actually
   * returns hppUrl with /flex already on it ("https://txpgtst.kapitalbank.az/flex").
   * Following the docs literally yields /flex/flex, which the gateway answers with
   * "not found" — verified against the live sandbox. Tolerate both shapes so this keeps
   * working whichever way the bank reconciles its docs with its API.
   */
  private hppBase(hppUrl: string): string {
    const trimmed = hppUrl.replace(/\/$/, '');
    return trimmed.endsWith('/flex') ? trimmed : `${trimmed}/flex`;
  }

  /**
   * The order-status table is now published (see the Notion docs link on the class
   * docblock); the values below are transcribed from it. An unknown status still
   * throws rather than guessing FAILED: silently mapping a paid order to FAILED
   * would cancel a real booking, and the cost of the two mistakes is not symmetric.
   *
   * Caveat: the docs table prints human-readable descriptions ("Fully paid",
   * "Being prepared"), not the literal enum values. The literals below come from
   * live API responses where we have them and are inferred as PascalCase otherwise.
   */
  private mapStatus(status: string): ProviderPaymentStatus {
    switch (status) {
      case 'Preparing':
        return 'CREATED';
      case 'FullyPaid':
      case 'Refunded': // refunds are out of scope, see TZ-KAPITAL-TXPG.md A9
      case 'Closed': // order closed after payment
        return 'SUCCEEDED';
      case 'Declined':
      case 'Rejected':
        return 'FAILED';
      // Accept both spellings: the API example uses one, the docs table prints
      // the other, and we have never seen the literal live.
      case 'Canceled':
      case 'Cancelled':
      case 'Refused': // consumer declined to pay on the hosted page (the Cancel order button)
      case 'Voided': // authorised amount reduced to zero by a full reversal
        return 'CANCELLED';
      case 'Expired':
        return 'EXPIRED';
      // 'Authorized', 'PartiallyPaid' and 'Funded' are documented, but only
      // reachable on order types we do not use (Order_DMS preauthorisation and
      // DualStep transfers). If KAPITAL_ORDER_TYPE is ever switched to Order_DMS
      // these need real handling together with the Clearing call — see
      // TZ-KAPITAL-TXPG.md A9. Until then, failing loudly is the intended behaviour.
      default:
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
   * There is still no documented failure-code field on the order itself, so we read the
   * last transaction's pmoResultCode. The PmoDecline code table is now published (see
   * pmo-decline-codes.ts), so the meaning of each code is known — including that '2'
   * ("Approved Partial") and '3' ("Approved Purchase Only") are approvals too, which the
   * old `=== '1'` check misreported as failures.
   *
   * Returns the machine-readable `pmo:<code>` shape; it is persisted in
   * Payment.failureCode and existing rows already use it, so the format is fixed. An
   * unknown code is still surfaced as `pmo:<code>` rather than swallowed.
   */
  private extractFailureCode(order: KapitalOrderDetailResponse['order']): string | null {
    const trans = order.trans;
    if (!trans || trans.length === 0) return null;
    const last = trans[trans.length - 1];
    const code = last.pmoResultCode;
    if (!code || isPmoApproval(code)) return null;
    if (describePmoResultCode(code) === null) {
      // Not in the published PmoDecline table — still surface it, never swallow it.
      console.warn(`[kapital] undocumented pmoResultCode on order ${order.id}: ${code}`);
    }
    return `pmo:${code}`;
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
