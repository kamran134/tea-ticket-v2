export type PaymentCurrency = 'AZN';

export type ProviderPaymentStatus =
  | 'CREATED'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface CreatePaymentInput {
  orderId: string;
  amount: string;
  currency: PaymentCurrency;
  description: string;
  returnUrl: string;
  webhookUrl: string;
}

export interface CreatePaymentResult {
  providerPaymentId: string;
  redirectUrl: string;
  status: ProviderPaymentStatus;
}

export interface ProviderPaymentState {
  providerPaymentId: string;
  orderId: string;
  amount: string;
  currency: PaymentCurrency;
  status: ProviderPaymentStatus;
  paidAt: string | null;
  failureCode: string | null;
}

export interface WebhookEvent {
  providerEventId: string;
  providerPaymentId: string;
  orderId: string;
  amount: string;
  currency: PaymentCurrency;
  status: ProviderPaymentStatus;
  paidAt: string | null;
  failureCode: string | null;
  rawPayload: unknown;
}

export const ACTIVE_PAYMENT_STATUSES = ['CREATED', 'PROCESSING'] as const;
export const TERMINAL_PAYMENT_STATUSES = [
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'REQUIRES_REVIEW',
] as const;
