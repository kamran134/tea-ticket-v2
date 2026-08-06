import type { TicketEmailInput, TicketEmailSender } from './types';

/** Local/dev sender: no network, does not log recipient or HTML. */
export class ConsoleEmailSender implements TicketEmailSender {
  async send(input: TicketEmailInput): Promise<{ providerMessageId: string }> {
    console.log(
      `[email-job] console-send job=${input.jobId} checkout=${input.checkoutId} simulated=true`,
    );
    return { providerMessageId: `console_${input.jobId}` };
  }
}
