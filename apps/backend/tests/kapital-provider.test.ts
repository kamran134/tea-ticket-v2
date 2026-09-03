import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KapitalApiError, KapitalProvider, loadKapitalConfig } from '../src/services/payments/kapital-provider';
import { describePmoResultCode, isPmoApproval } from '../src/services/payments/pmo-decline-codes';
import type { PaymentProvider } from '../src/services/payments/payment-provider';
import type { CreatePaymentInput } from '../src/services/payments/types';

function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const baseInput: CreatePaymentInput = {
  orderId: 'pay_1',
  amount: '12.5000',
  currency: 'AZN',
  description: 'Tea Ticket checkout pay_1',
  returnUrl: 'http://localhost:3001/api/payments/return/tok123',
  webhookUrl: 'http://localhost:3000/api/webhooks/payments/kapital',
};

function newProvider() {
  return new KapitalProvider({
    apiBaseUrl: 'https://txpgtst.kapitalbank.az/api',
    username: 'TerminalSys/kapital',
    password: 'kapital123',
    orderType: 'Order_SMS',
    language: 'az',
    timeoutMs: 15000,
  });
}

describe('KapitalProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends Basic auth and the amount unmodified (N.NNNN, no 2-decimal conversion)', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, {
        order: { id: 265855, hppUrl: 'https://txpgtst.kapitalbank.az/flex', password: 'pw123', status: 'Preparing' },
      }),
    );

    const provider = newProvider();
    await provider.createPayment(baseInput);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://txpgtst.kapitalbank.az/api/order');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from('TerminalSys/kapital:kapital123').toString('base64')}`,
    );
    const body = JSON.parse(init.body);
    expect(body.order.amount).toBe('12.5000');
    expect(body.order.typeRid).toBe('Order_SMS');
    expect(body.order.hppRedirectUrl).toBe(baseInput.returnUrl);
  });

  // Regression: the docs template is `{{order.hppUrl}}/flex?id=...`, but the live API
  // returns hppUrl with /flex already included. Appending it again produced
  // .../flex/flex?id=... which the gateway serves as "not found" — confirmed against
  // the real sandbox, and it reached tea-ticket.com before being caught.
  it('does not double the /flex segment when hppUrl already contains it', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, {
        order: { id: 265855, hppUrl: 'https://txpgtst.kapitalbank.az/flex', password: 'nnoerzar64sm', status: 'Preparing' },
      }),
    );

    const provider = newProvider();
    const result = await provider.createPayment(baseInput);

    expect(result.providerPaymentId).toBe('265855');
    expect(result.redirectUrl).toBe(
      'https://txpgtst.kapitalbank.az/flex?id=265855&password=nnoerzar64sm',
    );
    expect(result.redirectUrl).not.toContain('/flex/flex');
    expect(result.status).toBe('CREATED');
  });

  it('appends /flex when hppUrl is a bare origin, as the docs describe it', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, {
        order: { id: 265855, hppUrl: 'https://txpgtst.kapitalbank.az', password: 'pw', status: 'Preparing' },
      }),
    );

    const provider = newProvider();
    const result = await provider.createPayment(baseInput);

    expect(result.redirectUrl).toBe('https://txpgtst.kapitalbank.az/flex?id=265855&password=pw');
  });

  it('throws when the create-order response is missing password', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, { order: { id: 265855, hppUrl: 'https://txpgtst.kapitalbank.az/flex', status: 'Preparing' } }),
    );

    const provider = newProvider();
    await expect(provider.createPayment(baseInput)).rejects.toThrow(/hppUrl or password/);
  });

  it('parses a numeric amount from getPaymentStatus into our N.NNNN string format', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, {
        order: { id: 265863, status: 'FullyPaid', amount: 12.5, currency: 'AZN', finishTime: '2026-08-27 20:01:44' },
      }),
    );

    const provider = newProvider();
    const state = await provider.getPaymentStatus('265863');

    expect(state.amount).toBe('12.5000');
    expect(state.status).toBe('SUCCEEDED');
    expect(state.paidAt).toBe('2026-08-27T20:01:44+04:00');
  });

  it('throws KapitalApiError (not a generic success) on HTTP 400 with errorCode', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(400, { errorCode: 'InvalidLogin', errorDescription: 'Invalid login or password' }),
    );

    const provider = newProvider();
    await expect(provider.getPaymentStatus('1')).rejects.toMatchObject({
      errorCode: 'InvalidLogin',
      httpStatus: 400,
    } satisfies Partial<KapitalApiError>);
  });

  it('throws KapitalApiError on HTTP 404 with errorCode (order-check runs before res.ok)', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(404, { errorCode: 'ServiceError', errorDescription: 'no order found' }),
    );

    const provider = newProvider();
    await expect(provider.getPaymentStatus('999999999')).rejects.toMatchObject({
      errorCode: 'ServiceError',
      httpStatus: 404,
    } satisfies Partial<KapitalApiError>);
  });

  it('fails loudly on an undocumented order status instead of guessing FAILED', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, { order: { id: 1, status: 'SomeNewPreauthStatus', amount: 1, currency: 'AZN' } }),
    );

    const provider = newProvider();
    await expect(provider.getPaymentStatus('1')).rejects.toThrow(/Unknown Kapital order status/);
  });

  it.each([
    ['Closed', 'SUCCEEDED'],
    ['Rejected', 'FAILED'],
    ['Refused', 'CANCELLED'],
    ['Voided', 'CANCELLED'],
    ['Canceled', 'CANCELLED'],
    ['Cancelled', 'CANCELLED'],
  ])('maps the newly documented status %s to %s', async (txpgStatus, expected) => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, { order: { id: 1, status: txpgStatus, amount: 1, currency: 'AZN' } }),
    );

    const provider = newProvider();
    const state = await provider.getPaymentStatus('1');
    expect(state.status).toBe(expected);
  });

  // Deliberate regression guard: the preauthorisation / dual-step statuses stay unmapped
  // on purpose and must keep throwing until Order_DMS + Clearing is implemented (TZ A9).
  it.each(['Authorized', 'PartiallyPaid', 'Funded'])(
    'still throws on the intentionally unmapped preauth status %s',
    async (txpgStatus) => {
      fetchMock.mockResolvedValueOnce(
        fakeResponse(200, { order: { id: 1, status: txpgStatus, amount: 1, currency: 'AZN' } }),
      );

      const provider = newProvider();
      await expect(provider.getPaymentStatus('1')).rejects.toThrow(/Unknown Kapital order status/);
    },
  );

  it.each([
    ['1', null],
    // Regression on the old `=== '1'` check: 2 and 3 are approvals too.
    ['2', null],
    ['3', null],
    ['81', 'pmo:81'],
    ['999', 'pmo:999'], // undocumented code is surfaced, not swallowed
  ])('extractFailureCode: last pmoResultCode %s -> failureCode %s', async (pmoResultCode, expected) => {
    fetchMock.mockResolvedValueOnce(
      fakeResponse(200, {
        order: {
          id: 1,
          status: 'Declined',
          amount: 1,
          currency: 'AZN',
          trans: [{ pmoResultCode }],
        },
      }),
    );

    const provider = newProvider();
    const state = await provider.getPaymentStatus('1');
    expect(state.failureCode).toBe(expected);
  });

  it('never has verifyAndParseWebhook — supportsWebhooks is false', () => {
    const provider: PaymentProvider = newProvider();
    expect(provider.supportsWebhooks).toBe(false);
    expect(provider.verifyAndParseWebhook).toBeUndefined();
  });
});

describe('loadKapitalConfig', () => {
  const keys = ['KAPITAL_API_BASE_URL', 'KAPITAL_USERNAME', 'KAPITAL_PASSWORD', 'KAPITAL_ORDER_TYPE', 'KAPITAL_LANGUAGE', 'KAPITAL_TIMEOUT_MS'] as const;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
    for (const k of keys) delete process.env[k];
  });

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('throws a clear error when required vars are missing', () => {
    expect(() => loadKapitalConfig()).toThrow(/KAPITAL_API_BASE_URL/);
  });

  it('applies documented defaults for optional vars', () => {
    process.env.KAPITAL_API_BASE_URL = 'https://txpgtst.kapitalbank.az/api/';
    process.env.KAPITAL_USERNAME = 'u';
    process.env.KAPITAL_PASSWORD = 'p';

    const cfg = loadKapitalConfig();
    expect(cfg.apiBaseUrl).toBe('https://txpgtst.kapitalbank.az/api'); // trailing slash stripped
    expect(cfg.orderType).toBe('Order_SMS');
    expect(cfg.language).toBe('az');
    expect(cfg.timeoutMs).toBe(15000);
  });
});

describe('pmo-decline-codes', () => {
  it('describePmoResultCode returns the published title', () => {
    expect(describePmoResultCode('51')).toBe('Expired card');
    expect(describePmoResultCode('81')).toBe('Bad CVV2');
    expect(describePmoResultCode('7')).toBe("Need Checker's confirmation");
  });

  it('describePmoResultCode returns null for a code not in the table', () => {
    expect(describePmoResultCode('999')).toBeNull();
  });

  it('isPmoApproval covers 0/1/2/3 and nothing else', () => {
    expect(isPmoApproval('0')).toBe(true);
    expect(isPmoApproval('1')).toBe(true);
    expect(isPmoApproval('2')).toBe(true);
    expect(isPmoApproval('3')).toBe(true);
    expect(isPmoApproval('51')).toBe(false);
  });
});
