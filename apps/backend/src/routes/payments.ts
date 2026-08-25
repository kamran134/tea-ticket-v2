import { Router } from 'express';
import { z } from 'zod';
import type { PaymentService } from '../services/payments/payment-service';
import { PaymentError } from '../services/payments/payment-service';
import { ErrorCodes, fail, failZod } from '../errors';
import { logScope } from '../middleware/requestId';

const createSchema = z.object({
  ticketId: z.string().min(1),
});

export function paymentsRouter(paymentService: PaymentService): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return failZod(res, parsed.error);
    }
    try {
      const data = await paymentService.createPaymentForTicket(parsed.data.ticketId);
      logScope('payments/create', 'payment created', {
        paymentId: data.paymentId,
        ticketId: parsed.data.ticketId,
        amount: data.amount,
      });
      return res.status(201).json({ success: true, data });
    } catch (err) {
      if (err instanceof PaymentError) {
        return fail(res, err.status, err.code, err.message);
      }
      console.error('[payments/create]', err);
      return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to create payment');
    }
  });

  router.get('/:id/status', async (req, res) => {
    const returnToken = typeof req.query.token === 'string' ? req.query.token : undefined;
    try {
      const data = await paymentService.getPaymentStatus(req.params.id, returnToken);
      return res.json({ success: true, data });
    } catch (err) {
      if (err instanceof PaymentError) {
        return fail(res, err.status, err.code, err.message);
      }
      console.error('[payments/status]', err);
      return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to get payment status');
    }
  });

  router.get('/return/:token', async (req, res) => {
    try {
      const redirectUrl = await paymentService.getReturnRedirect(req.params.token);
      return res.redirect(302, redirectUrl);
    } catch (err) {
      if (err instanceof PaymentError) {
        return fail(res, err.status, err.code, err.message);
      }
      console.error('[payments/return]', err);
      return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to process return');
    }
  });

  return router;
}
