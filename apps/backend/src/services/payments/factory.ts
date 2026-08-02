import { MockPaymentProvider } from './mock-provider';
import { BankProvider } from './bank-provider';
import type { PaymentProvider } from './payment-provider';

export interface PaymentProviderConfig {
  provider: 'mock' | 'bank';
  publicAppUrl: string;
  mockWebhookSecret: string;
}

export function loadPaymentProviderConfig(): PaymentProviderConfig {
  const provider = (process.env.PAYMENT_PROVIDER ?? 'mock') as 'mock' | 'bank';
  if (provider !== 'mock' && provider !== 'bank') {
    throw new Error(`Unknown PAYMENT_PROVIDER: ${provider}`);
  }

  return {
    provider,
    publicAppUrl: process.env.PUBLIC_APP_URL ?? 'http://localhost:3001',
    mockWebhookSecret: process.env.MOCK_WEBHOOK_SECRET ?? 'dev-mock-webhook-secret',
  };
}

export function createPaymentProvider(config?: PaymentProviderConfig): PaymentProvider {
  const cfg = config ?? loadPaymentProviderConfig();

  switch (cfg.provider) {
    case 'mock': {
      const mock = new MockPaymentProvider(cfg.publicAppUrl, cfg.mockWebhookSecret);
      globalThis.__mockPaymentProvider = mock;
      return mock;
    }
    case 'bank':
      return new BankProvider();
    default:
      throw new Error(`Unknown PAYMENT_PROVIDER: ${cfg.provider as string}`);
  }
}
