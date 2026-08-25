import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { ErrorCodes, fail, failZod, isTestMode } from '../errors';
import { resetTestData, seedQaEvent } from '../services/qa-seed';
import { getMockProvider } from '../services/payments/mock-provider';
import type { PaymentService } from '../services/payments/payment-service';
import { PaymentError } from '../services/payments/payment-service';
import { logScope } from '../middleware/requestId';

const simulateSchema = z.object({
  scenario: z.enum([
    'SUCCESS',
    'FAILURE',
    'CANCEL',
    'DUPLICATE_WEBHOOK',
    'INVALID_SIGNATURE',
    'AMOUNT_MISMATCH',
    'UNKNOWN_PAYMENT',
  ]),
});

function testModeGuard(_req: Request, res: Response, next: NextFunction): void {
  if (!isTestMode()) {
    fail(res, 404, ErrorCodes.NOT_FOUND, 'Not found');
    return;
  }
  next();
}

export function testRouter(paymentService: PaymentService): Router {
  const router = Router();
  router.use(testModeGuard);

  router.post('/reset', async (_req, res) => {
    try {
      const seed = await resetTestData(prisma);
      logScope('test/reset', 'test data reset', { venueId: seed.venueId });
      return res.json({ success: true, data: seed });
    } catch (err) {
      console.error('[test/reset]', err);
      return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to reset test data');
    }
  });

  router.post('/seed', async (_req, res) => {
    try {
      const seed = await seedQaEvent(prisma);
      logScope('test/seed', 'qa event seeded', { venueId: seed.venueId });
      return res.json({ success: true, data: seed });
    } catch (err) {
      console.error('[test/seed]', err);
      return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to seed qa event');
    }
  });

  router.post('/payments/:id/simulate', async (req, res) => {
    const parsed = simulateSchema.safeParse(req.body);
    if (!parsed.success) {
      return failZod(res, parsed.error);
    }

    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!payment) {
      return fail(res, 404, ErrorCodes.PAYMENT_NOT_FOUND, 'Payment not found');
    }

    const mock = getMockProvider();
    if (!mock) {
      return fail(res, 404, ErrorCodes.NOT_FOUND, 'Mock provider is not active');
    }

    const scenario = parsed.data.scenario;
    logScope('test/simulate', 'simulating payment scenario', {
      paymentId: payment.id,
      scenario,
    });

    try {
      if (scenario === 'UNKNOWN_PAYMENT') {
        const body = JSON.stringify({
          eventId: `test_unknown_${Date.now()}`,
          event: 'payment.succeeded',
          paymentId: 'mock_does_not_exist',
          orderId: 'pay_does_not_exist',
          amount: '1.0000',
          currency: 'AZN',
          status: 'SUCCEEDED',
          paidAt: new Date().toISOString(),
        });
        await paymentService.handleWebhook('mock', Buffer.from(body), {
          'x-mock-payment-signature': mock.signPayload(body),
        });
        return fail(res, 404, ErrorCodes.PAYMENT_NOT_FOUND, 'Payment not found for webhook');
      }

      if (scenario === 'INVALID_SIGNATURE') {
        const body = JSON.stringify({
          eventId: `test_badsig_${Date.now()}`,
          event: 'payment.succeeded',
          paymentId: payment.providerPaymentId,
          orderId: payment.id,
          amount: payment.amount.toFixed(4),
          currency: 'AZN',
          status: 'SUCCEEDED',
          paidAt: new Date().toISOString(),
        });
        try {
          await paymentService.handleWebhook('mock', Buffer.from(body), {
            'x-mock-payment-signature': 'invalid',
          });
        } catch (err) {
          if (err instanceof PaymentError) {
            return fail(res, err.status, err.code, err.message);
          }
          throw err;
        }
        return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Expected invalid signature to fail');
      }

      if (scenario === 'AMOUNT_MISMATCH') {
        const body = JSON.stringify({
          eventId: `test_mismatch_${Date.now()}`,
          event: 'payment.succeeded',
          paymentId: payment.providerPaymentId,
          orderId: payment.id,
          amount: '9999.0000',
          currency: 'AZN',
          status: 'SUCCEEDED',
          paidAt: new Date().toISOString(),
        });
        try {
          await paymentService.handleWebhook('mock', Buffer.from(body), {
            'x-mock-payment-signature': mock.signPayload(body),
          });
        } catch (err) {
          if (err instanceof PaymentError) {
            return fail(res, err.status, err.code, err.message);
          }
          throw err;
        }
        return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Expected amount mismatch to fail');
      }

      const token = mock.getSessionByProviderPaymentId(payment.providerPaymentId ?? '')?.token;
      if (!token) {
        return fail(res, 404, ErrorCodes.PAYMENT_NOT_FOUND, 'Mock payment session not found');
      }

      const outcome = scenario === 'SUCCESS' || scenario === 'DUPLICATE_WEBHOOK'
        ? 'success'
        : scenario === 'FAILURE' ? 'failure' : 'cancel';

      const simulated = mock.simulateOutcome(token, outcome);
      const first = await paymentService.handleWebhook(
        'mock',
        Buffer.from(simulated.webhookBody),
        { 'x-mock-payment-signature': simulated.signature },
      );

      if (scenario === 'DUPLICATE_WEBHOOK') {
        const second = await paymentService.handleWebhook(
          'mock',
          Buffer.from(simulated.webhookBody),
          { 'x-mock-payment-signature': simulated.signature },
        );
        return res.json({
          success: true,
          data: { ...second, duplicate: true },
          error: { code: ErrorCodes.DUPLICATE_WEBHOOK, message: 'Webhook already processed' },
        });
      }

      return res.json({ success: true, data: first });
    } catch (err) {
      if (err instanceof PaymentError) {
        return fail(res, err.status, err.code, err.message);
      }
      console.error('[test/simulate]', err);
      return fail(res, 500, ErrorCodes.INTERNAL_ERROR, 'Failed to simulate payment');
    }
  });

  return router;
}
