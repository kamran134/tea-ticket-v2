import { MockPaymentProvider } from './mock-provider';
import { KapitalProvider, loadKapitalConfig } from './kapital-provider';
import type { PaymentProvider } from './payment-provider';

export interface PaymentProviderConfig {
  provider: 'mock' | 'kapital';
  publicAppUrl: string;
  webhookBaseUrl: string;
  mockWebhookSecret: string;
}

export function loadPaymentProviderConfig(): PaymentProviderConfig {
  const provider = (process.env.PAYMENT_PROVIDER ?? 'mock') as 'mock' | 'kapital';
  if (provider !== 'mock' && provider !== 'kapital') {
    throw new Error(`Unknown PAYMENT_PROVIDER: ${provider}`);
  }

  const publicAppUrl = process.env.PUBLIC_APP_URL ?? 'http://localhost:3001';

  return {
    provider,
    publicAppUrl,
    webhookBaseUrl: process.env.PAYMENT_WEBHOOK_BASE_URL ?? publicAppUrl,
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
    case 'kapital': {
      return new KapitalProvider(loadKapitalConfig());
    }
    default:
      throw new Error(`Unknown PAYMENT_PROVIDER: ${cfg.provider as string}`);
  }
}
