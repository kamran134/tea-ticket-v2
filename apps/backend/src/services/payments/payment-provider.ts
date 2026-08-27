import type { IncomingHttpHeaders } from 'http';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  ProviderPaymentState,
  WebhookEvent,
} from './types';

export interface PaymentProvider {
  readonly name: string;

  /**
   * false => провайдер не шлёт вебхуки (например Kapital TXPG), и статус подтверждается
   * только опросом через getPaymentStatus. verifyAndParseWebhook в этом случае может
   * отсутствовать — вызывающий код обязан проверить supportsWebhooks перед вызовом.
   */
  readonly supportsWebhooks: boolean;

  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;

  /** Обязателен только когда supportsWebhooks === true. */
  verifyAndParseWebhook?(rawBody: Buffer, headers: IncomingHttpHeaders): WebhookEvent;

  getPaymentStatus(providerPaymentId: string): Promise<ProviderPaymentState>;

  cancelPayment?(providerPaymentId: string): Promise<void>;

  refundPayment?(providerPaymentId: string, amount: string): Promise<void>;
}
