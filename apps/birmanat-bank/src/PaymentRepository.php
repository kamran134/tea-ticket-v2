<?php

declare(strict_types=1);

namespace BirManatBank;

use PDO;

final class PaymentRepository
{
    private PDO $pdo;

    public function __construct(string $sqlitePath)
    {
        $dir = dirname($sqlitePath);
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }

        $this->pdo = new PDO('sqlite:' . $sqlitePath, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $this->pdo->exec('PRAGMA foreign_keys = ON');
        $this->migrate();
    }

    public function pdo(): PDO
    {
        return $this->pdo;
    }

    private function migrate(): void
    {
        $this->pdo->exec(
            <<<'SQL'
            CREATE TABLE IF NOT EXISTS payments (
                id TEXT PRIMARY KEY,
                token TEXT NOT NULL UNIQUE,
                order_id TEXT NOT NULL,
                amount TEXT NOT NULL,
                currency TEXT NOT NULL,
                description TEXT NOT NULL,
                return_url TEXT NOT NULL,
                webhook_url TEXT NOT NULL,
                status TEXT NOT NULL,
                paid_at TEXT NULL,
                webhook_event_id TEXT NULL,
                webhook_delivery_status TEXT NULL,
                webhook_http_status INTEGER NULL,
                webhook_error TEXT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            SQL
        );
    }

    /**
     * @param array<string, mixed> $payment
     */
    public function create(array $payment): void
    {
        $stmt = $this->pdo->prepare(
            <<<'SQL'
            INSERT INTO payments (
                id, token, order_id, amount, currency, description,
                return_url, webhook_url, status, paid_at,
                webhook_event_id, webhook_delivery_status, webhook_http_status, webhook_error,
                created_at, updated_at
            ) VALUES (
                :id, :token, :order_id, :amount, :currency, :description,
                :return_url, :webhook_url, :status, :paid_at,
                :webhook_event_id, :webhook_delivery_status, :webhook_http_status, :webhook_error,
                :created_at, :updated_at
            )
            SQL
        );
        $stmt->execute($payment);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function findById(string $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM payments WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function findByToken(string $token): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM payments WHERE token = :token');
        $stmt->execute(['token' => $token]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /**
     * @param array<string, mixed> $fields
     */
    public function update(string $id, array $fields): void
    {
        $sets = [];
        $params = ['id' => $id];
        foreach ($fields as $key => $value) {
            $sets[] = "{$key} = :{$key}";
            $params[$key] = $value;
        }
        $sql = 'UPDATE payments SET ' . implode(', ', $sets) . ' WHERE id = :id';
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
    }
}
