# BirManatBank

Симулятор банка для проекта Tea Ticket. PHP 8.3 + Slim + SQLite.

## Endpoints

| Method | Path | Auth | Описание |
|--------|------|------|----------|
| GET | `/health` | — | Healthcheck |
| POST | `/api/v1/payments` | Bearer | Создать платёжную сессию |
| GET | `/api/v1/payments/{id}` | Bearer | Статус платежа |
| GET | `/pay/{token}` | — | Hosted payment page |
| POST | `/pay/{token}/confirm` | — | Подтверждение SMS-кодом `0000` |

## Env

- `BIRMANAT_BANK_PUBLIC_URL` — абсолютный публичный base URL (`http://localhost:8082` или `https://tickets.birmanat.band/bank`)
- `BIRMANAT_BANK_API_TOKEN`
- `BIRMANAT_BANK_WEBHOOK_SECRET`
- `BIRMANAT_BANK_ALLOWED_HOSTS` — CSV allowlist для `returnUrl` / `webhookUrl`
- `BIRMANAT_BANK_SQLITE_PATH`

Валюта только `AZN`. Суммы — строки формата `N.NNNN`.
