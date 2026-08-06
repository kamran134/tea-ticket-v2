import type { IncomingHttpHeaders } from 'http';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  ProviderPaymentState,
  WebhookEvent,
} from './types';

export interface PaymentProvider {
  readonly name: string;

  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;

  verifyAndParseWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): WebhookEvent;

  getPaymentStatus(providerPaymentId: string): Promise<ProviderPaymentState>;

  cancelPayment?(providerPaymentId: string): Promise<void>;

  refundPayment?(providerPaymentId: string, amount: string): Promise<void>;
}
