import type { IncomingHttpHeaders } from 'http';
import type { PaymentProvider } from './payment-provider';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  ProviderPaymentState,
  WebhookEvent,
} from './types';

const NOT_CONFIGURED =
  'BankProvider is not configured. Implement the bank adapter when real API credentials are available.';

/**
 * Stub adapter for a real bank acquiring API.
 * Replace method bodies with bank-specific REST calls, signature verification,
 * and status mapping when documentation is available.
 */
export class BankProvider implements PaymentProvider {
  readonly name = 'bank';

  createPayment(_input: CreatePaymentInput): Promise<CreatePaymentResult> {
    return Promise.reject(new Error(NOT_CONFIGURED));
  }

  verifyAndParseWebhook(_rawBody: Buffer, _headers: IncomingHttpHeaders): WebhookEvent {
    throw new Error(NOT_CONFIGURED);
  }

  getPaymentStatus(_providerPaymentId: string): Promise<ProviderPaymentState> {
    return Promise.reject(new Error(NOT_CONFIGURED));
  }

  cancelPayment(_providerPaymentId: string): Promise<void> {
    return Promise.reject(new Error(NOT_CONFIGURED));
  }

  refundPayment(_providerPaymentId: string, _amount: string): Promise<void> {
    return Promise.reject(new Error(NOT_CONFIGURED));
  }
}
