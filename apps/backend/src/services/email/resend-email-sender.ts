import { Resend } from 'resend';
import {
  PermanentEmailError,
  TransientEmailError,
  type TicketEmailInput,
  type TicketEmailSender,
} from './types';

export class ResendEmailSender implements TicketEmailSender {
  private readonly resend: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
    private readonly replyTo?: string,
  ) {
    this.resend = new Resend(apiKey);
  }

  async send(input: TicketEmailInput): Promise<{ providerMessageId: string }> {
    let result: Awaited<ReturnType<Resend['emails']['send']>>;
    try {
      result = await this.resend.emails.send(
        {
          from: this.from,
          to: input.recipient,
          subject: input.subject,
          html: input.html,
          text: input.text,
          replyTo: input.replyTo ?? this.replyTo,
          tags: [{ name: 'type', value: 'ticket-confirmed' }],
          attachments: [
            {
              filename: 'ticket-qr.png',
              content: input.qrPng,
              contentId: 'ticket-qr',
            },
          ],
        },
        { idempotencyKey: `ticket-confirmed/${input.jobId}` },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'network_error';
      throw new TransientEmailError(message, 'NETWORK');
    }

    if (result.error) {
      const code = result.error.name ?? 'resend_error';
      const statusCode =
        'statusCode' in result.error && typeof result.error.statusCode === 'number'
          ? result.error.statusCode
          : undefined;
      const message = result.error.message || code;

      if (
        statusCode === 429 ||
        statusCode === undefined ||
        (statusCode >= 500 && statusCode < 600)
      ) {
        throw new TransientEmailError(message, code);
      }
      throw new PermanentEmailError(message, code);
    }

    if (!result.data?.id) {
      throw new TransientEmailError('Missing provider message id', 'MISSING_ID');
    }

    return { providerMessageId: result.data.id };
  }
}
