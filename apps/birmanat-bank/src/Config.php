<?php

declare(strict_types=1);

namespace BirManatBank;

final class Config
{
    public function __construct(
        public readonly string $publicUrl,
        public readonly string $apiToken,
        public readonly string $webhookSecret,
        /** @var list<string> */
        public readonly array $allowedHosts,
        public readonly string $sqlitePath,
        public readonly string $smsCode = '0000',
        public readonly string $cardMask = '**** **** **** 4242',
        public readonly string $merchantName = 'Tea Ticket',
    ) {
    }

    public static function fromEnv(): self
    {
        $allowedHosts = array_values(array_filter(array_map(
            static fn (string $h): string => strtolower(trim($h)),
            explode(',', (string) (getenv('BIRMANAT_BANK_ALLOWED_HOSTS') ?: 'tickets.birmanat.band,backend,localhost,127.0.0.1')),
        )));

        return new self(
            publicUrl: rtrim((string) (getenv('BIRMANAT_BANK_PUBLIC_URL') ?: 'http://localhost:8082'), '/'),
            apiToken: (string) (getenv('BIRMANAT_BANK_API_TOKEN') ?: 'dev-birmanat-bank-token'),
            webhookSecret: (string) (getenv('BIRMANAT_BANK_WEBHOOK_SECRET') ?: 'dev-birmanat-bank-webhook-secret'),
            allowedHosts: $allowedHosts,
            sqlitePath: (string) (getenv('BIRMANAT_BANK_SQLITE_PATH') ?: dirname(__DIR__) . '/var/bank.sqlite'),
        );
    }
}
