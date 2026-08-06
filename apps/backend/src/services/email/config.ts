export interface EmailConfig {
  enabled: boolean;
  apiKey: string;
  webhookSecret: string;
  from: string;
  replyTo: string;
  maxAttempts: number;
  publicFrontendUrl: string;
}

export function loadEmailConfig(env: NodeJS.ProcessEnv = process.env): EmailConfig {
  const enabled = (env.EMAIL_ENABLED ?? 'false').toLowerCase() === 'true';
  const apiKey = env.RESEND_API_KEY ?? '';
  const from = env.EMAIL_FROM ?? '';
  const replyTo = env.EMAIL_REPLY_TO ?? 'support@birmanat.band';
  const webhookSecret = env.RESEND_WEBHOOK_SECRET ?? '';
  const maxAttemptsRaw = env.EMAIL_MAX_ATTEMPTS ? Number.parseInt(env.EMAIL_MAX_ATTEMPTS, 10) : 5;
  const maxAttempts = Number.isFinite(maxAttemptsRaw) && maxAttemptsRaw > 0 ? maxAttemptsRaw : 5;
  const publicFrontendUrl =
    env.PUBLIC_FRONTEND_URL ?? env.PUBLIC_APP_URL ?? 'http://localhost:5173';

  if (enabled) {
    if (!apiKey) {
      throw new Error('EMAIL_ENABLED=true requires RESEND_API_KEY');
    }
    if (!from) {
      throw new Error('EMAIL_ENABLED=true requires EMAIL_FROM');
    }
  }

  return {
    enabled,
    apiKey,
    webhookSecret,
    from,
    replyTo,
    maxAttempts,
    publicFrontendUrl: publicFrontendUrl.replace(/\/$/, ''),
  };
}
