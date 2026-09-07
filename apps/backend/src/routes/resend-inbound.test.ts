import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  createResendInboundWebhookHandler,
  type ResendInboundConfig,
  type ResendInboundDependencies,
} from './resend-inbound';

const config: ResendInboundConfig = {
  apiKey: 're_test',
  webhookSecret: 'whsec_test',
  telegramBotToken: 'bot_test',
  telegramChatId: '-100123',
};

function createDependencies(
  overrides: Partial<ResendInboundDependencies> = {},
): ResendInboundDependencies {
  return {
    verifyWebhook: vi.fn().mockReturnValue({
      type: 'email.received',
      data: { email_id: 'email_123' },
    }),
    persistInboundEmail: vi.fn().mockResolvedValue(undefined),
    getReceivedEmail: vi.fn(),
    sendTelegramMessage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createTestApp(dependencies: ResendInboundDependencies) {
  const app = express();
  app.post(
    '/api/resend/inbound',
    express.raw({ type: 'application/json' }),
    createResendInboundWebhookHandler({} as never, config, dependencies),
  );
  return app;
}

function webhookRequest(app: ReturnType<typeof createTestApp>, body: object) {
  return request(app)
    .post('/api/resend/inbound')
    .set('content-type', 'application/json')
    .set('svix-id', 'msg_test')
    .set('svix-timestamp', '1770000000')
    .set('svix-signature', 'v1,test')
    .send(JSON.stringify(body));
}

describe('Resend inbound webhook', () => {
  it('persists the inbound email before optional forwarding', async () => {
    const persistInboundEmail = vi.fn().mockResolvedValue(undefined);
    const dependencies = createDependencies({ persistInboundEmail });

    await webhookRequest(createTestApp(dependencies), {
      type: 'email.received',
      data: { email_id: 'email_123' },
    }).expect(200);

    expect(persistInboundEmail).toHaveBeenCalledWith('email_123');
  });

  it('retrieves the received email and forwards its full text to Telegram', async () => {
    const getReceivedEmail = vi.fn().mockResolvedValue({
      from: 'sender@example.com',
      to: ['inbox@example.com'],
      subject: 'Tea ceremony',
      text: 'Full email body',
      html: '<p>Full email body</p>',
      headers: { from: 'Sender Name <sender@example.com>' },
      attachments: [{ filename: 'details.pdf' }],
    });
    const sendTelegramMessage = vi.fn().mockResolvedValue(undefined);
    const dependencies = createDependencies({
      getReceivedEmail,
      sendTelegramMessage,
    });

    await webhookRequest(createTestApp(dependencies), {
      type: 'email.received',
      data: { email_id: 'email_123' },
    }).expect(200);

    expect(getReceivedEmail).toHaveBeenCalledWith('email_123');
    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      expect.stringContaining('От: Sender Name <sender@example.com>'),
    );
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      expect.stringContaining('Full email body'),
    );
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      expect.stringContaining('Вложения: details.pdf'),
    );
  });

  it('splits long emails into Telegram-sized messages', async () => {
    const sendTelegramMessage = vi.fn().mockResolvedValue(undefined);
    const dependencies = createDependencies({
      verifyWebhook: vi.fn().mockReturnValue({
        type: 'email.received',
        data: { email_id: 'email_long' },
      }),
      getReceivedEmail: vi.fn().mockResolvedValue({
        from: 'sender@example.com',
        to: ['inbox@example.com'],
        subject: 'Long email',
        text: 'x'.repeat(8_500),
        html: null,
        headers: null,
        attachments: [],
      }),
      sendTelegramMessage,
    });

    await webhookRequest(createTestApp(dependencies), {
      type: 'email.received',
      data: { email_id: 'email_long' },
    }).expect(200);

    expect(sendTelegramMessage).toHaveBeenCalledTimes(3);
    for (const [message] of sendTelegramMessage.mock.calls) {
      expect(Array.from(message as string).length).toBeLessThanOrEqual(4000);
    }
  });

  it('returns 200 without calling Telegram when credentials are missing', async () => {
    const noTelegramConfig: ResendInboundConfig = {
      apiKey: '',
      webhookSecret: 'whsec_test',
      telegramBotToken: '',
      telegramChatId: '',
    };
    const getReceivedEmail = vi.fn();
    const sendTelegramMessage = vi.fn();
    const dependencies = createDependencies({
      getReceivedEmail,
      sendTelegramMessage,
    });
    const app = express();
    app.post(
      '/api/resend/inbound',
      express.raw({ type: 'application/json' }),
      createResendInboundWebhookHandler({} as never, noTelegramConfig, dependencies),
    );

    await webhookRequest(app, {
      type: 'email.received',
      data: { email_id: 'email_no_tg' },
    }).expect(200);

    expect(getReceivedEmail).not.toHaveBeenCalled();
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it('returns 200 when Telegram forwarding fails', async () => {
    const sendTelegramMessage = vi.fn().mockRejectedValue(new Error('Telegram down'));
    const dependencies = createDependencies({
      getReceivedEmail: vi.fn().mockResolvedValue({
        from: 'sender@example.com',
        to: ['inbox@example.com'],
        subject: 'Tea ceremony',
        text: 'Body',
        html: null,
        headers: null,
        attachments: [],
      }),
      sendTelegramMessage,
    });

    await webhookRequest(createTestApp(dependencies), {
      type: 'email.received',
      data: { email_id: 'email_tg_fail' },
    }).expect(200);
  });

  it('ignores webhook events other than email.received', async () => {
    const persistInboundEmail = vi.fn();
    const getReceivedEmail = vi.fn();
    const sendTelegramMessage = vi.fn();
    const dependencies = createDependencies({
      verifyWebhook: vi.fn().mockReturnValue({
        type: 'email.delivered',
        data: { email_id: 'email_sent' },
      }),
      persistInboundEmail,
      getReceivedEmail,
      sendTelegramMessage,
    });

    await webhookRequest(createTestApp(dependencies), {
      type: 'email.delivered',
      data: { email_id: 'email_sent' },
    }).expect(200);

    expect(persistInboundEmail).not.toHaveBeenCalled();
    expect(getReceivedEmail).not.toHaveBeenCalled();
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });
});
