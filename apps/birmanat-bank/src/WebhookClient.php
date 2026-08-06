<?php

declare(strict_types=1);

namespace BirManatBank;

use RuntimeException;

class WebhookClient
{
    public function __construct(private readonly string $webhookSecret)
    {
    }

    /**
     * @param array<string, mixed> $payload
     * @return array{status: string, httpStatus: int|null, error: string|null, signature: string, body: string}
     */
    public function deliver(string $webhookUrl, array $payload): array
    {
        $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($body === false) {
            throw new RuntimeException('Failed to encode webhook payload');
        }

        $signature = hash_hmac('sha256', $body, $this->webhookSecret);
        $eventId = (string) $payload['eventId'];

        $ch = curl_init($webhookUrl);
        if ($ch === false) {
            return [
                'status' => 'FAILED',
                'httpStatus' => null,
                'error' => 'Failed to init cURL',
                'signature' => $signature,
                'body' => $body,
            ];
        }

        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 5,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'X-BirmanatBank-Signature: ' . $signature,
                'X-BirmanatBank-Event-Id: ' . $eventId,
            ],
        ]);

        $response = curl_exec($ch);
        $errno = curl_errno($ch);
        $error = $errno !== 0 ? curl_error($ch) : null;
        $httpStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno !== 0) {
            return [
                'status' => 'FAILED',
                'httpStatus' => null,
                'error' => $error ?: 'cURL error',
                'signature' => $signature,
                'body' => $body,
            ];
        }

        $ok = $httpStatus >= 200 && $httpStatus < 300;

        return [
            'status' => $ok ? 'DELIVERED' : 'FAILED',
            'httpStatus' => (int) $httpStatus,
            'error' => $ok ? null : ('HTTP ' . $httpStatus . ($response ? (': ' . substr((string) $response, 0, 200)) : '')),
            'signature' => $signature,
            'body' => $body,
        ];
    }

    public function sign(string $body): string
    {
        return hash_hmac('sha256', $body, $this->webhookSecret);
    }
}
