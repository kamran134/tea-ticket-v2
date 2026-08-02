import { Router } from 'express';
import { z } from 'zod';
import type { PaymentService } from '../services/payments/payment-service';
import { PaymentError } from '../services/payments/payment-service';

const createSchema = z.object({
  ticketId: z.string().min(1),
});

export function paymentsRouter(paymentService: PaymentService): Router {
  const router = Router();

  // POST /api/payments
  // Принимает ticketId любого билета checkout-группы, пересчитывает сумму по БД,
  // создаёт или возвращает активную попытку оплаты с redirectUrl на hosted page провайдера.
  router.post('/', async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
    }
    try {
      const data = await paymentService.createPaymentForTicket(parsed.data.ticketId);
      return res.status(201).json({ success: true, data });
    } catch (err) {
      if (err instanceof PaymentError) {
        return res.status(err.status).json({ success: false, error: err.message });
      }
      console.error('[payments/create]', err);
      return res.status(500).json({ success: false, error: 'Failed to create payment' });
    }
  });

  // GET /api/payments/:id/status?token=...
  // Публичный polling статуса платежа и связанных билетов.
  // token (returnToken) опционален, но рекомендуется после return с банка.
  router.get('/:id/status', async (req, res) => {
    const returnToken = typeof req.query.token === 'string' ? req.query.token : undefined;
    try {
      const data = await paymentService.getPaymentStatus(req.params.id, returnToken);
      return res.json({ success: true, data });
    } catch (err) {
      if (err instanceof PaymentError) {
        return res.status(err.status).json({ success: false, error: err.message });
      }
      console.error('[payments/status]', err);
      return res.status(500).json({ success: false, error: 'Failed to get payment status' });
    }
  });

  // GET /api/payments/return/:token
  // Return URL после hosted page банка: только редирект на frontend, статус не меняет.
  router.get('/return/:token', async (req, res) => {
    try {
      const redirectUrl = await paymentService.getReturnRedirect(req.params.token);
      return res.redirect(302, redirectUrl);
    } catch (err) {
      if (err instanceof PaymentError) {
        return res.status(err.status).json({ success: false, error: err.message });
      }
      console.error('[payments/return]', err);
      return res.status(500).json({ success: false, error: 'Failed to process return' });
    }
  });

  return router;
}
