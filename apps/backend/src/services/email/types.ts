export interface TicketEmailInput {
  jobId: string;
  checkoutId: string;
  recipient: string;
  subject: string;
  html: string;
  text: string;
  qrPng: Buffer;
  replyTo?: string;
}

export interface TicketEmailSender {
  send(input: TicketEmailInput): Promise<{ providerMessageId: string }>;
}

export class TransientEmailError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'TransientEmailError';
  }
}

export class PermanentEmailError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'PermanentEmailError';
  }
}

export type EnqueueTicketEmailResult =
  | { status: 'enqueued'; jobId: string }
  | { status: 'exists' }
  | { status: 'skipped'; reason: 'no_email' };
