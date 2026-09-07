# План: бейдж непрочитанных входящих писем в админке

Дата: 2026-09-07
Проект: tea-ticket-v2 (коммерческий продукт, установка для клиента, один админ)

Не inbox: ни списка, ни тела, ни метаданных письма. Только непрочитанный счётчик,
опциональный форвард в Telegram, вебхук всегда 200 после учёта письма.

## Зачем

Входящие на `support@` / Reply-To не должны остаться без сигнала. В админке —
только число новых писем. Тело, отправитель, тема, дата, вложения в БД и UI
не попадают.

## Что уже есть

- Исходящие: `POST /api/webhooks/resend` → статус доставки билета (`EmailJob`).
- Входящие: `POST /api/resend/inbound` (`email.received`) → `receiving.get(email_id)`
  → Telegram. Без Telegram-кредов хендлер сейчас отвечает **500**, Resend ретраит.

## Решение

Одна таблица `InboundEmail`: Resend `email_id` + `isRead`. Непрочитанные =
`COUNT(*) WHERE is_read = false`. Telegram — best-effort, если заданы ключи.
После учёта письма вебхук всегда **200**. Бейдж в шапке всех админ-страниц,
сброс «прочитано» из админки.

## Этап 1. Модель и вебхук

- [x] Одна таблица `InboundEmail`, без содержимого письма:
  - `id` (cuid)
  - `providerEmailId` unique — Resend `email_id`, идемпотентность ретраев
  - `isRead` Boolean `@default(false)` (`is_read` в Postgres)
  - индекс по `isRead` для `COUNT`
- [x] Миграция Prisma
- [x] `POST /api/resend/inbound`:
  1. verify подписи; битый raw body / нет секрета — как сейчас 400/401/500
  2. не `email.received` → 200 ignore
  3. нет `email_id` → 400
  4. новый `email_id` → insert `{ providerEmailId, isRead: false }`; повтор
     (unique / P2002) → no-op, строку не трогать (уже прочитанное не
     становится снова непрочитанным)
  5. Telegram: только если заданы `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`
     **и** `RESEND_API_KEY`. Тогда `receiving.get` и send. Ошибка fetch/Telegram —
     лог, **не** 5xx
  6. без ключей Telegram — `receiving.get` не вызывать
  7. после учёта (новый или дубль) всегда **200**
- [x] В БД не писать: from, to, subject, text, html, вложения, дату письма
- [x] Тесты: persist row, идемпотентность, 200 без Telegram, 200 если Telegram
  упал, форвард если ключи есть

## Этап 2. API админки

- [x] `requireAuth` на всех ручках
- [x] `GET /api/inbound-emails/unread-count` → `{ unreadCount }` из
  `COUNT(*) WHERE isRead = false`
- [x] `POST /api/inbound-emails/mark-all-read` → `UPDATE ... SET is_read = true
  WHERE is_read = false`
- [x] Тесты: 401, count, mark-all-read, вебхук после mark-read с тем же
  `email_id` не создаёт вторую строку и не сбрасывает `is_read`

## Этап 3. UI

- [x] Общий виджет шапки (не вкладка «Почта»): бейдж «N», клик →
  «Отметить прочитанными»
- [x] Виден на всех админ-страницах: `/manage` (любая вкладка) и `/admin` (сканер).
  На публичных страницах не показывать
- [x] Count при логине, полл ~30 с, `visibilitychange`
- [x] Бейдж скрыт при `unreadCount === 0`
- [x] Никакого списка писем, превью, отправителя, даты, вложений

## Этап 4. Проверка

- [x] `tsc --noEmit` backend + frontend
- [x] vitest вебхука и ручек
- [x] коммит

## Вне скоупа

Список/тело писем в админке, ответ из админки, вложения, связь «письмо ↔ билет».
