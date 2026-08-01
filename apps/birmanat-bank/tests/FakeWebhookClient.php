<?php

declare(strict_types=1);

namespace BirManatBank\Tests;

use BirManatBank\WebhookClient;

final class FakeWebhookClient extends WebhookClient
{
    /** @var list<array{url: string, payload: array<string, mixed>}> */
    public array $calls = [];

    public string $deliveryStatus = 'DELIVERED';

    public int $httpStatus = 200;

    public ?string $error = null;

    public function __construct(string $webhookSecret = 'test-secret')
    {
        parent::__construct($webhookSecret);
    }

    public function deliver(string $webhookUrl, array $payload): array
    {
        $this->calls[] = ['url' => $webhookUrl, 'payload' => $payload];
        $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '{}';

        return [
            'status' => $this->deliveryStatus,
            'httpStatus' => $this->httpStatus,
            'error' => $this->error,
            'signature' => $this->sign($body),
            'body' => $body,
        ];
    }
}
