import { Router } from 'express';
import { getMockProvider } from '../services/payments/mock-provider';

export function mockPaymentsRouter(): Router {
  const router = Router();

  // GET /api/mock-payments/:token
  // Hosted payment page mock-провайдера (только при PAYMENT_PROVIDER=mock).
  router.get('/:token', (req, res) => {
    const mock = getMockProvider();
    if (!mock) {
      return res.status(404).send('Mock provider is not active');
    }

    const session = mock.getSessionByToken(req.params.token);
    if (!session) {
      return res.status(404).send('Payment session not found');
    }

    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Mock Payment</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 2rem auto; padding: 0 1rem; }
    .amount { font-size: 1.5rem; margin: 1rem 0; }
    form { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1.5rem; }
    button { padding: 0.75rem; font-size: 1rem; cursor: pointer; border: 1px solid #ccc; border-radius: 6px; }
    .success { background: #e8f5e9; }
    .failure { background: #ffebee; }
    .cancel { background: #fff3e0; }
  </style>
</head>
<body data-testid="mock-payment-page" data-payment-status="${session.status}">
  <h1>Mock Bank — оплата</h1>
  <p>${session.description}</p>
  <p class="amount" data-testid="mock-payment-amount">${session.amount} ${session.currency}</p>
  <form method="post" action="/api/mock-payments/${req.params.token}/success">
    <button type="submit" class="success" data-testid="mock-payment-success">Успешная оплата</button>
  </form>
  <form method="post" action="/api/mock-payments/${req.params.token}/failure">
    <button type="submit" class="failure" data-testid="mock-payment-failure">Отклонить платёж</button>
  </form>
  <form method="post" action="/api/mock-payments/${req.params.token}/cancel">
    <button type="submit" class="cancel" data-testid="mock-payment-cancel">Отмена</button>
  </form>
</body>
</html>`;

    return res.type('html').send(html);
  });

  // POST /api/mock-payments/:token/:outcome
  // outcome: success | failure | cancel — имитирует результат оплаты и шлёт signed webhook.
  router.post('/:token/:outcome', async (req, res) => {
    const mock = getMockProvider();
    if (!mock) {
      return res.status(404).send('Mock provider is not active');
    }

    const outcome = req.params.outcome as 'success' | 'failure' | 'cancel';
    if (!['success', 'failure', 'cancel'].includes(outcome)) {
      return res.status(400).send('Invalid outcome');
    }

    try {
      const { webhookBody, signature, webhookUrl } = mock.simulateOutcome(req.params.token, outcome);

      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Mock-Payment-Signature': signature,
        },
        body: webhookBody,
      });

      const returnUrl = mock.buildReturnUrl(req.params.token);
      return res.redirect(302, returnUrl);
    } catch (err) {
      console.error('[mock-payments/outcome]', err);
      return res.status(500).send('Failed to process mock payment');
    }
  });

  return router;
}
