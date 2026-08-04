import { Request, Response } from 'express';
import { Resend } from 'resend';

const TELEGRAM_MESSAGE_LIMIT = 4000;

type ResendInboundEvent = {
  type: string;
  data?: {
    email_id?: string;
  };
};

type ReceivedEmail = {
  from: string;
  to: string[];
  subject: string;
  text: string | null;
  html: string | null;
  headers: Record<string, string> | null;
  attachments: Array<{ filename: string | null }>;
};

export interface ResendInboundConfig {
  apiKey: string;
  webhookSecret: string;
  telegramBotToken: string;
  telegramChatId: string;
}

export interface ResendInboundDependencies {
  verifyWebhook(
    payload: string,
    headers: { id: string; timestamp: string; signature: string },
  ): ResendInboundEvent;
  getReceivedEmail(emailId: string): Promise<ReceivedEmail>;
  sendTelegramMessage(text: string): Promise<void>;
}

export function loadResendInboundConfig(
  env: NodeJS.ProcessEnv = process.env,
): ResendInboundConfig {
  return {
    apiKey: env.RESEND_API_KEY ?? '',
    webhookSecret:
      env.RESEND_INBOUND_WEBHOOK_SECRET ?? env.RESEND_WEBHOOK_SECRET ?? '',
    telegramBotToken: env.TELEGRAM_BOT_TOKEN ?? '',
    telegramChatId: env.TELEGRAM_CHAT_ID ?? '',
  };
}

function splitTelegramMessage(message: string): string[] {
  const characters = Array.from(message);
  const chunks: string[] = [];

  for (let offset = 0; offset < characters.length; offset += TELEGRAM_MESSAGE_LIMIT) {
    chunks.push(characters.slice(offset, offset + TELEGRAM_MESSAGE_LIMIT).join(''));
  }

  return chunks.length > 0 ? chunks : ['(пустое письмо)'];
}

function formatInboundEmail(email: ReceivedEmail): string {
  const sender = email.headers?.from ?? email.from;
  const body = email.text?.trim() || email.html?.trim() || '(пустое письмо)';
  const attachments = email.attachments
    .map(attachment => attachment.filename)
    .filter((filename): filename is string => Boolean(filename));

  const lines = [
    '📩 Новое входящее письмо',
    `От: ${sender}`,
    `Кому: ${email.to.join(', ')}`,
    `Тема: ${email.subject || '(без темы)'}`,
  ];

  if (attachments.length > 0) {
    lines.push(`Вложения: ${attachments.join(', ')}`);
  }

  lines.push('', body);
  return lines.join('\n');
}

function createDefaultDependencies(
  config: ResendInboundConfig,
): ResendInboundDependencies {
  const resend = new Resend(config.apiKey || 're_inbound_not_configured');

  return {
    verifyWebhook(payload, headers) {
      return resend.webhooks.verify({
        payload,
        headers,
        webhookSecret: config.webhookSecret,
      }) as ResendInboundEvent;
    },

    async getReceivedEmail(emailId) {
      const result = await resend.emails.receiving.get(emailId);
      if (result.error) {
        throw new Error(
          `Resend receiving API failed: ${result.error.name ?? 'unknown_error'}`,
        );
      }
      if (!result.data) {
        throw new Error('Resend receiving API returned no email');
      }
      return result.data;
    },

    async sendTelegramMessage(text) {
      const response = await fetch(
        `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: config.telegramChatId,
            text,
            disable_web_page_preview: true,
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );

      if (!response.ok) {
        throw new Error(`Telegram API failed with HTTP ${response.status}`);
      }

      const result = await response.json() as { ok?: boolean };
      if (!result.ok) {
        throw new Error('Telegram API rejected the message');
      }
    },
  };
}

export function createResendInboundWebhookHandler(
  config: ResendInboundConfig = loadResendInboundConfig(),
  dependencies?: ResendInboundDependencies,
) {
  const deps = dependencies ?? createDefaultDependencies(config);

  return async (req: Request, res: Response): Promise<void> => {
    const rawBody = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody)) {
      res.status(400).json({ success: false, error: 'Expected raw body' });
      return;
    }

    if (!config.webhookSecret) {
      console.error('[resend-inbound] webhook secret is not configured');
      res.status(500).json({ success: false, error: 'Webhook not configured' });
      return;
    }

    const id = req.header('svix-id');
    const timestamp = req.header('svix-timestamp');
    const signature = req.header('svix-signature');
    if (!id || !timestamp || !signature) {
      res.status(401).json({ success: false, error: 'Missing webhook signature headers' });
      return;
    }

    let event: ResendInboundEvent;
    try {
      event = deps.verifyWebhook(rawBody.toString('utf8'), {
        id,
        timestamp,
        signature,
      });
    } catch {
      console.warn('[resend-inbound] invalid signature');
      res.status(401).json({ success: false, error: 'Invalid webhook signature' });
      return;
    }

    if (event.type !== 'email.received') {
      res.status(200).json({ success: true, data: { ignored: true } });
      return;
    }

    const emailId = event.data?.email_id;
    if (!emailId) {
      res.status(400).json({ success: false, error: 'Missing email_id' });
      return;
    }

    if (!config.apiKey || !config.telegramBotToken || !config.telegramChatId) {
      console.error('[resend-inbound] Resend or Telegram credentials are not configured');
      res.status(500).json({ success: false, error: 'Inbound forwarding not configured' });
      return;
    }

    try {
      const email = await deps.getReceivedEmail(emailId);
      const messages = splitTelegramMessage(formatInboundEmail(email));

      for (const message of messages) {
        await deps.sendTelegramMessage(message);
      }

      console.log(
        `[resend-inbound] forwarded emailId=${emailId} messages=${messages.length}`,
      );
      res.status(200).json({ success: true });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      console.error(`[resend-inbound] forwarding failed emailId=${emailId}: ${reason}`);
      res.status(502).json({ success: false, error: 'Failed to forward inbound email' });
    }
  };
}
