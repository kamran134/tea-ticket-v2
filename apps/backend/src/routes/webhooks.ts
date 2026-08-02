import { Request, Response, Router } from 'express';
import type { PaymentService } from '../services/payments/payment-service';
import { PaymentError } from '../services/payments/payment-service';
import {
  kickEmailJobProcessing,
  type EmailJobProcessor,
} from '../services/email';

// POST /api/webhooks/payments/:provider
// Webhook от платёжного провайдера (server-to-server). Подключается в app.ts до express.json(),
// чтобы verifyAndParseWebhook получил raw body для проверки подписи.
export function createWebhookHandler(
  paymentService: PaymentService,
  emailJobProcessor?: EmailJobProcessor,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const rawBody = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody)) {
      res.status(400).json({ success: false, error: 'Expected raw body' });
      return;
    }

    try {
      const result = await paymentService.handleWebhook(
        req.params.provider,
        rawBody,
        req.headers,
      );

      if (emailJobProcessor) {
        res.on('finish', () => {
          if (res.statusCode === 200) {
            kickEmailJobProcessing(emailJobProcessor);
          }
        });
      }

      res.status(200).json({ success: true, data: result });
    } catch (err) {
      if (err instanceof PaymentError) {
        res.status(err.status).json({ success: false, error: err.message });
        return;
      }
      console.error('[webhooks/payments]', err);
      res.status(500).json({ success: false, error: 'Webhook processing failed' });
    }
  };
}

export function webhooksRouter(
  paymentService: PaymentService,
  emailJobProcessor?: EmailJobProcessor,
): Router {
  const router = Router();
  router.post('/:provider', createWebhookHandler(paymentService, emailJobProcessor));
  return router;
}
