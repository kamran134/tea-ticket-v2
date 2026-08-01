<?php

declare(strict_types=1);

namespace BirManatBank;

use InvalidArgumentException;
use RuntimeException;

final class PaymentService
{
    private const AMOUNT_PATTERN = '/^\d+\.\d{4}$/';

    public function __construct(
        private readonly Config $config,
        private readonly PaymentRepository $repository,
        private readonly UrlValidator $urlValidator,
        private readonly WebhookClient $webhookClient,
    ) {
    }

    /**
     * @param array<string, mixed> $input
     * @return array{paymentId: string, status: string, paymentUrl: string}
     */
    public function createPayment(array $input): array
    {
        $orderId = trim((string) ($input['orderId'] ?? ''));
        $amount = trim((string) ($input['amount'] ?? ''));
        $currency = strtoupper(trim((string) ($input['currency'] ?? '')));
        $description = trim((string) ($input['description'] ?? ''));
        $returnUrl = trim((string) ($input['returnUrl'] ?? ''));
        $webhookUrl = trim((string) ($input['webhookUrl'] ?? ''));

        if ($orderId === '') {
            throw new InvalidArgumentException('orderId is required');
        }
        if ($description === '') {
            throw new InvalidArgumentException('description is required');
        }
        if ($currency !== 'AZN') {
            throw new InvalidArgumentException('currency must be AZN');
        }
        if (!preg_match(self::AMOUNT_PATTERN, $amount)) {
            throw new InvalidArgumentException('amount must match format N.NNNN (4 decimal places)');
        }
        if (bccomp($amount, '0.0000', 4) <= 0) {
            throw new InvalidArgumentException('amount must be greater than zero');
        }

        $this->urlValidator->assertAllowed($returnUrl, 'returnUrl');
        $this->urlValidator->assertAllowed($webhookUrl, 'webhookUrl');

        $id = 'bmp_' . bin2hex(random_bytes(12));
        $token = bin2hex(random_bytes(24));
        $now = gmdate('c');

        $this->repository->create([
            'id' => $id,
            'token' => $token,
            'order_id' => $orderId,
            'amount' => $amount,
            'currency' => 'AZN',
            'description' => $description,
            'return_url' => $returnUrl,
            'webhook_url' => $webhookUrl,
            'status' => 'CREATED',
            'paid_at' => null,
            'webhook_event_id' => null,
            'webhook_delivery_status' => null,
            'webhook_http_status' => null,
            'webhook_error' => null,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return [
            'paymentId' => $id,
            'status' => 'CREATED',
            'paymentUrl' => $this->config->publicUrl . '/pay/' . $token,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function getPayment(string $paymentId): array
    {
        $payment = $this->repository->findById($paymentId);
        if ($payment === null) {
            throw new RuntimeException('Payment not found', 404);
        }

        return $this->toPublic($payment);
    }

    /**
     * @return array<string, mixed>
     */
    public function getPaymentByToken(string $token): array
    {
        $payment = $this->repository->findByToken($token);
        if ($payment === null) {
            throw new RuntimeException('Payment not found', 404);
        }

        return $payment;
    }

    /**
     * Confirm payment with SMS code. Returns redirect URL for browser.
     *
     * @return array{redirectUrl: string, payment: array<string, mixed>, alreadyPaid: bool}
     */
    public function confirmPayment(string $token, string $smsCode): array
    {
        $payment = $this->repository->findByToken($token);
        if ($payment === null) {
            throw new RuntimeException('Payment not found', 404);
        }

        if ($payment['status'] === 'PAID') {
            return [
                'redirectUrl' => $this->buildReturnUrl($payment, 'success'),
                'payment' => $payment,
                'alreadyPaid' => true,
            ];
        }

        if ($smsCode !== $this->config->smsCode) {
            throw new InvalidArgumentException('Invalid SMS code');
        }

        $pdo = $this->repository->pdo();
        $pdo->beginTransaction();
        try {
            $locked = $this->repository->findByToken($token);
            if ($locked === null) {
                throw new RuntimeException('Payment not found', 404);
            }
            if ($locked['status'] === 'PAID') {
                $pdo->commit();

                return [
                    'redirectUrl' => $this->buildReturnUrl($locked, 'success'),
                    'payment' => $locked,
                    'alreadyPaid' => true,
                ];
            }

            $paidAt = gmdate('c');
            $eventId = 'bme_' . bin2hex(random_bytes(12));
            $this->repository->update($locked['id'], [
                'status' => 'PAID',
                'paid_at' => $paidAt,
                'webhook_event_id' => $eventId,
                'updated_at' => $paidAt,
            ]);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        $payment = $this->repository->findById($locked['id']);
        if ($payment === null) {
            throw new RuntimeException('Payment disappeared after confirm');
        }

        $this->deliverWebhook($payment);

        $payment = $this->repository->findById($payment['id']) ?? $payment;

        return [
            'redirectUrl' => $this->buildReturnUrl($payment, 'success'),
            'payment' => $payment,
            'alreadyPaid' => false,
        ];
    }

    /**
     * @param array<string, mixed> $payment
     */
    public function deliverWebhook(array $payment): void
    {
        $payload = [
            'eventId' => $payment['webhook_event_id'] ?? ('bme_' . bin2hex(random_bytes(12))),
            'event' => 'payment.succeeded',
            'paymentId' => $payment['id'],
            'orderId' => $payment['order_id'],
            'amount' => $payment['amount'],
            'currency' => $payment['currency'],
            'status' => 'PAID',
            'paidAt' => $payment['paid_at'],
        ];

        $result = $this->webhookClient->deliver((string) $payment['webhook_url'], $payload);

        $this->repository->update((string) $payment['id'], [
            'webhook_event_id' => $payload['eventId'],
            'webhook_delivery_status' => $result['status'],
            'webhook_http_status' => $result['httpStatus'],
            'webhook_error' => $result['error'],
            'updated_at' => gmdate('c'),
        ]);
    }

    /**
     * @param array<string, mixed> $payment
     * @return array<string, mixed>
     */
    public function toPublic(array $payment): array
    {
        return [
            'paymentId' => $payment['id'],
            'orderId' => $payment['order_id'],
            'amount' => $payment['amount'],
            'currency' => $payment['currency'],
            'description' => $payment['description'],
            'status' => $payment['status'],
            'paidAt' => $payment['paid_at'],
            'webhook' => [
                'eventId' => $payment['webhook_event_id'],
                'deliveryStatus' => $payment['webhook_delivery_status'],
                'httpStatus' => $payment['webhook_http_status'],
                'error' => $payment['webhook_error'],
            ],
            'createdAt' => $payment['created_at'],
            'updatedAt' => $payment['updated_at'],
        ];
    }

    /**
     * @param array<string, mixed> $payment
     */
    private function buildReturnUrl(array $payment, string $status): string
    {
        $url = (string) $payment['return_url'];
        $sep = str_contains($url, '?') ? '&' : '?';

        return $url . $sep . http_build_query([
            'paymentId' => $payment['id'],
            'status' => $status,
        ]);
    }
}
