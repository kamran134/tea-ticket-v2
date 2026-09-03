# ТЗ: переход на эквайринг Kapital Bank TXPG + удаление симулятора и ребрендинг

Ветка для работы: **`dev`** (именно она деплоится на tea-ticket.com — проверено по
`org.opencontainers.image.revision` образа на проде, совпадает с HEAD `origin/dev`).

Документ писался по реальному исходнику ветки `dev` и по живым запросам к тестовому
контуру банка (27.08.2026). Всё, что помечено «проверено», проверено запросом, а не взято из доков.

Работа делится на две независимые части: **A** — платёжная интеграция, **B** — удаление
симулятора и ребрендинг. Части можно делать в любом порядке, но B затрагивает файлы,
которые правит A (`factory.ts`, `.env.example`, compose), поэтому удобнее сначала A, потом B.

---

# ЧАСТЬ A. Интеграция Kapital Bank TXPG

## A1. Задача

Добавить платёжного провайдера Kapital Bank (шлюз TXPG) и сделать его основным.
Существующий `bank-provider.ts` (клиент к нашему PHP-симулятору) удаляется — см. часть B.
`mock-provider.ts` **остаётся** и продолжает обслуживать юнит-тесты и офлайн-разработку.

Документация банка: https://pg.kapitalbank.az/docs (SPA на азербайджанском).
Более полная английская копия:
https://brawny-airport-7ca.notion.site/Kapital-bank-E-commerce-API-Documentation-6dd6a228c40644e3bef034bca7845e3c
— в ней заполнены таблицы статусов заказа, кодов ошибок и PmoDecline, которые в SPA
поставлялись пустыми.

## A2. Проверенные факты о шлюзе

| | |
|---|---|
| Test base URL | `https://txpgtst.kapitalbank.az/api` |
| Prod base URL | `https://e-commerce.kapitalbank.az/api` |
| Авторизация | HTTP **Basic** |
| Тестовые креды | `TerminalSys/kapital` / `kapital123` (публичные, прямо в доках) |
| Тестовый терминал | `E1000010`, мерчант `testmerch` |
| Тестовые карты | `4169741330151778` ExpDate 06/27 CVV2 591 · `5239151747183468` ExpDate 11/27 CVV2 602 |

Актуальные тестовые карты присланы банком по почте 03.09.2026 и подтверждены владельцем
проекта — реальный тестовый платёж прошёл. В Notion-копии доков всё ещё напечатаны более
старые сроки (11/26 и 11/24); рабочие значения — те, что в таблице выше (из письма).

### A2.1 Создание заказа — проверено

```
POST /order      Authorization: Basic base64(user:pass)
{"order":{"typeRid":"Order_SMS","amount":"12.5000","currency":"AZN","language":"az",
          "title":"tea-ticket","description":"...","hppRedirectUrl":"https://example.com/return"}}
```
Ответ `HTTP 200`:
```json
{"order":{"id":265863,"hppUrl":"https://txpgtst.kapitalbank.az/flex",
          "password":"nnoerzar64sm","status":"Preparing",
          "cvv2AuthStatus":"Required","secret":"287829"}}
```

### A2.2 Статус заказа — проверено

```
GET /order/{id}
GET /order/{id}?tranDetailLevel=2&orderDetailLevel=2
```
```json
{"order":{"id":265863,"typeRid":"Order_SMS","status":"Preparing","amount":12.5,
          "currency":"AZN","createTime":"2026-08-27 20:01:44","title":"tea-ticket"}}
```

### A2.3 Ошибки — проверено

| Ситуация | HTTP | Тело |
|---|---|---|
| Неверный пароль | **400** | `{"errorCode":"InvalidLogin","errorDescription":"Invalid login or password"}` |
| Неверная валюта | **400** | `{"errorCode":"ServiceError","errorDescription":"Object from Currency ... not found by PID = XYZ"}` |
| Несуществующий заказ | **404** | `{"errorCode":"ServiceError","errorDescription":"no order found"}` |

Два вывода, оба важны:
- HTTP-коды разные (400 и 404), но **`errorCode` присутствует всегда** — разбирать надо по нему;
- `errorCode` **переиспользуется**: `ServiceError` прилетает и на битую валюту, и на отсутствующий
  заказ. Строить логику на `errorCode` как на дискриминаторе нельзя, на тексте `errorDescription` — тем более.

### A2.4 Платёжная страница — проверено

`{hppUrl}/flex?id={id}&password={password}` открывается: брендинг Birbank, сумма и Payment ID
подтянуты, Visa / Mastercard / UnionPay, Google Pay, кнопка Cancel order, языки AZ/EN/RU.

### A2.5 Формат суммы — проверено

Наш внутренний формат — `N.NNNN`, 4 знака (`assertAmountFormat`, регексп `/^\d+\.\d{4}$/`).
Шлюз строку `"12.5000"` **принимает** и сохраняет как `12.5`. Конвертация не нужна,
`input.amount` уходит в банк как есть.

Обратно `amount` приходит **числом** (`12.5`), а не строкой. `assertAmountFormat()` на ответе
упадёт. Использовать `formatAmount()` — он принимает `number | string | Decimal`.

### A2.6 Прочие наблюдения

1. **Вебхуков нет вообще.** Банк возвращает пользователя браузерным GET-редиректом на
   `hppRedirectUrl` с `?ID=1234&STATUS=FullyPaid`. Приходит **через браузер клиента**,
   подделывается тривиально. Доки прямо пишут: `STATUS` может быть промежуточным,
   подтверждать серверным `GET /order/{ID}`.
2. **Приятное следствие:** раз входящих запросов от банка нет, для локальной разработки
   не нужен ни туннель, ни публичный URL. `hppRedirectUrl=http://localhost:5173/...`
   работает, потому что по нему ходит браузер пользователя, а не банк.
3. **У `Order_DMS` в ответе нет поля `secret`**, у `Order_SMS` есть. Не делать обязательным.
4. **Нет поля под наш `orderId`.** Идентификатор заказа генерирует банк. Наш `payment.id`
   кладём в `description`, обратная связь — только через сохранённый `providerPaymentId`.
5. **Таблицы «Ödəniş Statusları», «Errorlar», «PmoDecline Kodları».** По состоянию на
   03.09.2026 все три опубликованы в Notion-версии доков (ссылка в A1). Требование A6 —
   бросать ошибку на неизвестный статус — остаётся в силе: таблица даёт описания, а не
   литеральные значения enum, и статусы преавторизации всё ещё не обрабатываются.
6. Тестовый терминал общий для всех интеграторов, `order.id` сквозной и глобально растущий.
   Не закладываться на монотонность или диапазон id. Чужие заказы недоступны
   (`GET /order/1` -> 404), скоуп терминала соблюдается.

## A3. Расхождения с текущим кодом

| `bank-provider.ts` (удаляется) | Kapital TXPG |
|---|---|
| `POST /api/v1/payments` | `POST /order` |
| `Authorization: Bearer` | Basic auth |
| Webhook + HMAC-SHA256, заголовок `x-birmanatbank-signature` | вебхуков нет |
| `{success, data}` в ответе | плоский `{order:{...}}` / `{errorCode,...}` |
| ошибки по `res.ok` | 400/404, разбор по `errorCode` |

## A4. Новый файл: `apps/backend/src/services/payments/kapital-provider.ts`

```ts
export interface KapitalConfig {
  apiBaseUrl: string;   // без хвостового слэша
  username: string;
  password: string;
  orderType: 'Order_SMS' | 'Order_DMS';
  language: string;     // 'az' | 'en' | 'ru'
  timeoutMs: number;
}

export class KapitalApiError extends Error {
  constructor(readonly errorCode: string, readonly errorDescription: string, readonly httpStatus: number);
}

export class KapitalProvider implements PaymentProvider {
  readonly name = 'kapital';
  readonly supportsWebhooks = false;
  // verifyAndParseWebhook НЕ реализуем — метод становится опциональным, см. A5
}

export function loadKapitalConfig(): KapitalConfig;
```

### `createPayment(input)`

```jsonc
POST {apiBaseUrl}/order
{"order":{
  "typeRid":        config.orderType,
  "amount":         input.amount,      // как есть, "12.5000" — проверено, принимается
  "currency":       input.currency,    // "AZN"
  "language":       config.language,
  "title":          "Tea Ticket",
  "description":    input.description, // сюда уходит наш payment.id из вызывающего кода
  "hppRedirectUrl": input.returnUrl
}}
```
`input.webhookUrl` — **игнорировать**, шлюз его не принимает.

```ts
return {
  providerPaymentId: String(json.order.id),
  redirectUrl: `${json.order.hppUrl}/flex?id=${json.order.id}&password=${encodeURIComponent(json.order.password)}`,
  status: mapStatus(json.order.status),   // Preparing -> 'CREATED'
};
```
Если в ответе нет `order.id`, `order.hppUrl` или `order.password` — бросать ошибку.
`order.secret` не использовать (у DMS его нет).

### `getPaymentStatus(providerPaymentId)`

```
GET {apiBaseUrl}/order/{id}?tranDetailLevel=2&orderDetailLevel=2
```
```ts
assertCurrency(json.order.currency);          // должен быть AZN
return {
  providerPaymentId: String(json.order.id),
  orderId: '',                                // шлюз не хранит наш id
  amount: formatAmount(json.order.amount),    // приходит числом!
  currency: 'AZN',
  status: mapStatus(json.order.status),
  paidAt: toIso(json.order.finishTime),
  failureCode: <null | код отказа>,
};
```
`finishTime` в формате `YYYY-MM-DD HH:mm:ss` без таймзоны. Привести к ISO, трактуя как
**UTC+4 (Asia/Baku)**. Это допущение — зафиксировать комментарием и вынести в A10.

### `cancelPayment` / `refundPayment`

В этой итерации **не реализовывать**, см. A9.

### HTTP-обвязка

Один приватный метод `request<T>(method, path, body?)`:
- `AbortSignal.timeout(config.timeoutMs)`;
- заголовок Authorization собрать один раз в конструкторе;
- разбор ответа строго в этом порядке:

```ts
const json = await res.json();
if (json?.errorCode) {
  throw new KapitalApiError(json.errorCode, json.errorDescription, res.status);
}
if (!res.ok) {
  throw new KapitalApiError('HttpError', `HTTP ${res.status}`, res.status);
}
```
`errorCode` проверяется **до** `res.ok`, иначе 404 «no order found» потеряет код ошибки.

- **Никогда не логировать** креды, `order.password` и `redirectUrl` целиком —
  в redirectUrl лежит пароль заказа. В логах допустим только `order.id`.

## A5. `payment-provider.ts` — сделать вебхуки опциональными

```ts
export interface PaymentProvider {
  readonly name: string;
  /** false => провайдер не шлёт вебхуки, статус подтверждается только опросом. */
  readonly supportsWebhooks: boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /** Обязателен только когда supportsWebhooks === true. */
  verifyAndParseWebhook?(rawBody: Buffer, headers: IncomingHttpHeaders): WebhookEvent;
  getPaymentStatus(providerPaymentId: string): Promise<ProviderPaymentState>;
  cancelPayment?(providerPaymentId: string): Promise<void>;
  refundPayment?(providerPaymentId: string, amount: string): Promise<void>;
}
```
`MockPaymentProvider` — добавить `readonly supportsWebhooks = true`, больше ничего не менять.

## A6. Маппинг статусов

`TXPG order.status` -> `ProviderPaymentStatus`:

| TXPG | Наш | Источник |
|---|---|---|
| `Preparing` | `CREATED` | проверено живым запросом |
| `FullyPaid` | `SUCCEEDED` | проверено живым запросом |
| `Closed` | `SUCCEEDED` | таблица доков — заказ закрыт после оплаты |
| `Refunded` | `SUCCEEDED` | таблица доков; возвраты вне скоупа (A9) |
| `Declined` | `FAILED` | таблица доков |
| `Rejected` | `FAILED` | таблица доков |
| `Canceled` / `Cancelled` | `CANCELLED` | принимаем обе орфографии: в примере API одна, в таблице доков другая; вживую не видели |
| `Refused` | `CANCELLED` | таблица доков — клиент отказался платить на HPP (кнопка Cancel order) |
| `Voided` | `CANCELLED` | таблица доков — сумма авторизации обнулена полным реверсом |
| `Expired` | `EXPIRED` | таблица доков |

Намеренно **не** смаплены и должны падать:

| TXPG | Причина |
|---|---|
| `Authorized` | достижим только на `Order_DMS` (преавторизация) |
| `PartiallyPaid` | достижим только на `Order_DMS` |
| `Funded` | достижим только на DualStep-переводах |

При переключении `KAPITAL_ORDER_TYPE` на `Order_DMS` эти три статуса нужно обработать
вместе с вызовом `Clearing` — см. A9. До тех пор громкое падение — намеренное поведение.

**Неизвестный статус — бросать ошибку с полным текстом статуса, не мапить в `FAILED`.**
Таблица доков (A2.6 п.5) даёт человекочитаемые описания, а не литералы enum: литералы выше
взяты из живых ответов API, где они есть, и выведены как PascalCase в остальных случаях.
Тихий маппинг в `FAILED` означает отмену оплаченных билетов — цена ошибки несимметрична.
Пусть падает и логирует.

Существующий `mapProviderStatusToDb` в `payment-service.ts` не трогать.

## A7. `payment-service.ts` — пять правок

### (а) `handleWebhook` — защита от провайдера без вебхуков

Сейчас метод проверяет только имя провайдера (строка 169) и сразу зовёт
`this.deps.provider.verifyAndParseWebhook(...)`. С `kapital` имя совпадёт, метода не окажется,
и вместо честного 404 прилетит `TypeError` -> 500. Добавить после проверки имени:

```ts
if (!this.deps.provider.supportsWebhooks || !this.deps.provider.verifyAndParseWebhook) {
  throw new PaymentError(404, 'Provider does not support webhooks');
}
```

### (б) `reconcileProcessingPayments` -> `reconcilePendingPayments`

Сейчас фильтр `status: 'PROCESSING'` (строка 245). Для Kapital платёж после создания
остаётся в `CREATED` и в `PROCESSING` **не переходит никогда** — крон его не увидит,
и успешная оплата не подтвердится. Заменить на:

```ts
where: { status: { in: ['CREATED', 'PROCESSING'] }, providerPaymentId: { not: null } }
```
Обновить единственный вызов — `services/cron.ts:51`.

### (в) Проверка суммы на пути сверки — новое требование, это дыра

`handleWebhook` сверяет сумму (строка 199), а путь сверки — нет.
`applyProviderState` (строка 293) собирает синтетический `WebhookEvent` и **подставляет
в него сумму из нашей же БД** (строка 312), после чего `applyWebhookEvent` никакой сверки
не делает. То есть сумма, пришедшая от провайдера, не проверяется вообще.

Пока провайдер был вебхучный, это было терпимо — сверка шла в `handleWebhook`.
Для Kapital путь сверки становится **единственным**, и проверка суммы исчезает совсем.

Требование: в `applyProviderState` сверять `state.amount` с `payment.amount` через
`amountsEqual()`. При расхождении — **не подтверждать оплату**: перевести платёж в
`REQUIRES_REVIEW` (такой статус в `PaymentStatus` есть и уже используется в
`confirmCheckoutOnSuccess`), записать `failureCode = 'AMOUNT_MISMATCH'` и залогировать оба
значения через `console.error`.

Именно `REQUIRES_REVIEW`, а не `FAILED`: деньги у клиента могли быть списаны,
это случай для человека, а не для автоматической отмены.

Для этого в `applyProviderState` нужен полный `ProviderPaymentState`, а не урезанный
`{status, paidAt, failureCode}`, который он принимает сейчас — расширить сигнатуру.

### (г) `syncFromProvider(paymentId)` — новый приватный метод

Тянет `provider.getPaymentStatus(payment.providerPaymentId)` и, если статус терминальный
(`SUCCEEDED` / `FAILED` / `CANCELLED` / `EXPIRED`), зовёт `applyProviderState`.
Ошибки провайдера логировать и глотать, наружу не пробрасывать.

### (д) `getPaymentStatus` — синхронизация перед ответом

Сейчас метод читает только БД (строки 141–162). С TXPG это значит, что фронт после
возврата с HPP увидит устаревший статус до следующего прогона крона — **до 10 минут**.
Добавить после загрузки платежа:

```ts
// Провайдер без вебхуков — источник истины опрашивается здесь.
if (!this.deps.provider.supportsWebhooks && !isTerminal(payment.status)) {
  await this.syncFromProvider(paymentId);   // затем перечитать payment из БД
}
```
Фронт поллит этот эндпоинт, поэтому нужен **троттлинг**: не чаще одного обращения к банку
раз в 2 секунды на платёж. Достаточно `Map<paymentId, number>` в памяти сервиса с чисткой
по TTL. Если приложение поедет в несколько инстансов — понадобится колонка `lastSyncedAt`;
сейчас не делать, оставить комментарий.

Дополнительно вызвать `syncFromProvider` в `getReturnRedirect` (строка 125) перед сборкой
URL, в try/catch с проглатыванием ошибки — чтобы к моменту загрузки фронта статус был свежим.

**Чего в `getReturnRedirect` делать нельзя:** банк добавит к нашему return URL
`?ID=...&STATUS=...`. Эти параметры **не читать и ни на что не влиять** — они пришли через
браузер пользователя. Платёж идентифицируется только по нашему `returnToken` из пути.
Добавить это комментарием в код, иначе следующий читатель «оптимизирует».

## A8. `factory.ts`

- `provider: 'mock' | 'kapital'` (ветка `'bank'` уходит вместе с симулятором, часть B).
- `PAYMENT_PROVIDER=kapital` -> `new KapitalProvider(loadKapitalConfig())`.
- Неизвестное значение — по-прежнему бросать на старте.

## A9. Границы: чего в этой итерации не делать

- Возвраты и отмены (`refundPayment`, `cancelPayment`). Шлюз умеет
  (`POST /order/{id}/exec-tran` с `type:"Refund"` или `voidKind: Full|Partial`),
  но у нас нет ни UI, ни бизнес-правил возврата. Отдельная задача.
- Двухстадийную оплату `Order_DMS` + `Clearing`. Тип вынесен в конфиг `KAPITAL_ORDER_TYPE`
  на будущее, но логику `Clearing` не писать. Используем `Order_SMS`: `PAYMENT_HOLD_MINUTES`
  у нас — это срок брони **места**, а не преавторизация на карте; клиент платит сразу.
- Сохранённые карты, рекуррентные платежи, токенизацию (`set-src-token`).
- Google Pay (`gatewayid: ecommercekapitalbank`) — включается куратором банка отдельно.
- Рассрочку Birbank Taksit (`description: "TAKSIT=6"`).
- Миграции БД. Всё нужное уже есть: `providerPaymentId`, `redirectUrl`, `returnToken`,
  `expiresAt`, `failureCode`, статус `REQUIRES_REVIEW`. Пароль заказа отдельно хранить
  не надо — он внутри сохранённого `redirectUrl`.

## A10. Открытые вопросы к банку

Не блокируют разработку, нужны до прода:

1. Есть ли поле под наш идентификатор заказа (`merchantOrderId`)? В ответе виден
   `custAttrs` — можно ли писать туда?
2. **ЗАКРЫТО 03.09.2026.** Полный список значений `order.status` опубликован в Notion-копии
   доков (ссылка в A1); маппинг перенесён в A6. Для `Order_DMS` статусы (`Authorized`,
   `PartiallyPaid`, `Funded`) документированы, но пока намеренно не обрабатываются.
3. Таймзона `createTime` / `finishTime`.
4. Можно ли отменить заказ в статусе `Preparing` серверным запросом, или он гасится
   только по таймауту на стороне банка?
5. **ЗАКРЫТО 03.09.2026.** Свежие тестовые карты присланы банком по почте, значения в A2,
   реальный тестовый платёж прошёл.
6. Фиксированные IP шлюза и нужна ли регистрация `hppRedirectUrl` для прода.

Список кодов PmoDecline теперь также опубликован (Notion, ссылка в A1) и перенесён в
`apps/backend/src/services/payments/pmo-decline-codes.ts`.

---

# ЧАСТЬ B. Удаление симулятора и ребрендинг

## B1. Удалить симулятор BirManatBank

На dev теперь используется тестовый контур Kapital Bank, свой симулятор не нужен.
Офлайн-сценарии (юнит-тесты, CI, разработка без сети) закрывает `mock`-провайдер, он остаётся.

**Удалить целиком:**
- `apps/birmanat-bank/` — весь каталог (PHP 8.3 + Slim + SQLite, ~20 файлов со своими тестами)
- `apps/backend/src/services/payments/bank-provider.ts`
- `docker-compose.bank.yml`

**Вычистить упоминания:**
- `apps/backend/src/services/payments/factory.ts` — ветка `'bank'`, импорт `BankProvider`
- `apps/backend/tests/payments.test.ts` — импорт на строке 6 и тесты на строках ~217–246
  (`BankProvider`, `loadBankProviderConfig`, `x-birmanatbank-signature`, `BANK_*` env)
- `docker-compose.yml` — комментарий про overlay (строка 7), `BANK_API_BASE_URL` (53),
  `BANK_API_KEY`, `BANK_WEBHOOK_SECRET`
- `docker-compose.dev.yml` — `BANK_*` (47–49), сервис `birmanat-bank` (62, 67–80),
  том `birmanat_bank_data` (91)
- `.env.example` — `BIRMANAT_BANK_PORT` (15), `BIRMANAT_BANK_IMAGE` (20),
  блок `BANK_API_*` (49–52), блок симулятора (69–76), комментарий (96)
- `.claude/plan-branching.md` — упоминания сервиса `birmanat-bank` и `BIRMANAT_BANK_IMAGE`

`.github/workflows/deploy.yml` симулятор не упоминает — там править нечего.

## B2. Ребрендинг BirManat -> TeaTicket

### Осторожно: `BirManatBand` и `BirManatBank` — разные вещи

Отличаются одной буквой. `BirManat` / `birmanat.band` — **бренд группы**, заказчика площадки.
`BirManatBank` / `birmanat-bank` — **банковский симулятор** из B1. Слепой `find/replace`
по подстроке `birmanat` смешает их и заодно разнесёт почтовые шаблоны и брендинг фронта.
Идти по списку ниже, а не регекспом.

### Что заменить

Хардкод в коде (env-оверрайда нет, меняется гарантированно):

| Файл | Строка | Сейчас | Станет |
|---|---|---|---|
| `apps/backend/src/services/email/ticket-email-template.ts` | 86 | `brand: escapeHtml('BirManat')` | `'TeaTicket'` |
| ^ | 100 | `` `BirManat — Bilet təsdiqləndi / Билет подтверждён · ...` `` | `TeaTicket — ...` |
| ^ | 146 | `'BirManat'` | `'TeaTicket'` |
| `apps/backend/src/services/email/config.ts` | 15 | fallback `'support@birmanat.band'` | `'support@tea-ticket.com'` |
| `apps/frontend/src/lib/site.ts` | 4 | `EMAIL = 'support@birmanat.band'` | `'support@tea-ticket.com'` |
| ^ | 7 | `SITE_URL = 'https://birmanat.band'` | `'https://tea-ticket.com'` |

Дефолты в конфигах (перекрываются через `.env`, но привести к TeaTicket):

| Файл | Строка | Что |
|---|---|---|
| `docker-compose.yml` | 60–61 | `EMAIL_FROM`, `EMAIL_REPLY_TO` |
| `docker-compose.dev.yml` | 54–55 | то же |
| `.env.example` | 4–5, 8–9 | `DOMAIN`, `CORS_ORIGIN`, `DEPLOY_PATH`, `UPLOADS_PATH` |
| `.env.example` | 58–59 | `EMAIL_FROM`, `EMAIL_REPLY_TO` |
| `apps/backend/tests/setup.ts` | 9–10 | тестовые `EMAIL_FROM` / `EMAIL_REPLY_TO` |
| `apps/backend/tests/email.test.ts` | 390, 429, 469 | фикстуры `from:` |

Целевой домен — `tea-ticket.com` (он же в дефолтах `PUBLIC_APP_URL` / `PUBLIC_FRONTEND_URL`
в `docker-compose.yml`).

### Два фактора, которые надо учесть до мержа

1. **Почтовый домен.** Смена `EMAIL_FROM` на `@tea-ticket.com` сработает, только если этот
   домен верифицирован в Resend (DKIM/SPF). Если нет — транзакционные письма о подтверждении
   билета начнут отбиваться. Проверить в панели Resend до выката; если домен не готов,
   оставить почтовые дефолты как есть и сделать их отдельным шагом.
2. **Инстанс `tickets.birmanat.band`.** По `.claude/plan-branching.md` ветка `bank-emulation`
   деплоится на отдельную машину под доменом `tickets.birmanat.band`. Правки дефолтов в
   `.env.example` и compose его не сломают (у него свой `.env`), но **хардкод из таблицы выше
   он получит при следующем мерже**: письма и футер фронта у группы станут «TeaTicket».
   Если инстанс живой и брендинг группы там нужен — эти три строки шаблона и `site.ts`
   надо выносить в конфиг, а не хардкодить. Вынести вопрос владельцу до мержа в `bank-emulation`.

---

# C. Переменные окружения (итог)

Добавить в `.env.example` и в оба compose-файла:

```
PAYMENT_PROVIDER=kapital
KAPITAL_API_BASE_URL=https://txpgtst.kapitalbank.az/api
KAPITAL_USERNAME=TerminalSys/kapital
KAPITAL_PASSWORD=kapital123
KAPITAL_ORDER_TYPE=Order_SMS        # опционально, дефолт Order_SMS
KAPITAL_LANGUAGE=az                 # опционально, дефолт az
KAPITAL_TIMEOUT_MS=15000            # опционально, дефолт 15000
```
`loadKapitalConfig()` падает с внятным сообщением, если не заданы `KAPITAL_API_BASE_URL`,
`KAPITAL_USERNAME`, `KAPITAL_PASSWORD` — по образцу нынешнего `loadBankProviderConfig()`.

Удалить: `BANK_API_BASE_URL`, `BANK_API_KEY`, `BANK_WEBHOOK_SECRET`,
`BIRMANAT_BANK_API_TOKEN`, `BIRMANAT_BANK_WEBHOOK_SECRET`, `BIRMANAT_BANK_PUBLIC_URL`,
`BIRMANAT_BANK_ALLOWED_HOSTS`, `BIRMANAT_BANK_SQLITE_PATH`, `BIRMANAT_BANK_PORT`,
`BIRMANAT_BANK_IMAGE`.

Остаются как есть: `PUBLIC_APP_URL`, `PUBLIC_FRONTEND_URL`, `PAYMENT_HOLD_MINUTES`,
`PAYMENT_HOLD_SECONDS`, `MOCK_WEBHOOK_SECRET`.
`PAYMENT_WEBHOOK_BASE_URL` больше не нужен для kapital, но нужен для `mock` — оставить.

---

# D. Тесты

Файл: `apps/backend/tests/payments.test.ts` (туда же, где сейчас тесты `BankProvider`,
которые удаляются). `fetch` мокать — сеть в тестах не дёргать.

`KapitalProvider`:

1. `createPayment` шлёт верное тело и заголовок Basic; собирает `redirectUrl` вида
   `{hppUrl}/flex?id={id}&password={password}`.
2. `createPayment` отдаёт сумму в формате `N.NNNN` без конвертации.
3. Ответ без `order.password` -> ошибка.
4. `getPaymentStatus` переваривает `amount` **числом** (`12.5` -> `"12.5000"`).
5. `HTTP 400 {"errorCode":"InvalidLogin"}` -> `KapitalApiError`, а не успех.
6. `HTTP 404 {"errorCode":"ServiceError","errorDescription":"no order found"}` ->
   `KapitalApiError` с сохранённым `errorCode` (регрессия на порядок проверок в A4).
7. Неизвестный `order.status` -> ошибка, а не `FAILED`.

`PaymentService`:

8. `handleWebhook` с провайдером `supportsWebhooks: false` -> `PaymentError(404)`.
9. `reconcilePendingPayments` подхватывает платёж в статусе `CREATED` (регрессия на A7б).
10. Расхождение суммы в `applyProviderState` -> `REQUIRES_REVIEW` + `failureCode:
    'AMOUNT_MISMATCH'`, билеты **не** переходят в `CONFIRMED` (регрессия на A7в).
11. `getPaymentStatus` дёргает провайдера один раз при двух вызовах подряд (троттлинг).
12. `getReturnRedirect` игнорирует `?ID=&STATUS=` и резолвит платёж только по `returnToken`.

Существующие тесты на `mock`-провайдере должны проходить без правок, кроме добавления
`supportsWebhooks: true`.

---

# E. Критерий готовности

- `PAYMENT_PROVIDER=kapital` + тестовые креды -> `POST /api/payments` возвращает `redirectUrl`
  на `txpgtst.kapitalbank.az/flex`, страница открывается, сумма совпадает.
- После оплаты тестовой картой возврат на `/api/payments/return/:token` редиректит на фронт,
  а следующий `GET /api/payments/:id/status` уже отдаёт `SUCCEEDED`, не дожидаясь крона.
- Билеты checkout-группы переходят в `CONFIRMED`, письмо ставится в очередь.
- Брошенная оплата добирается кроном `reconcilePendingPayments` из статуса `CREATED`.
- `POST /api/webhooks/payments/kapital` отвечает 404, `mock` продолжает работать.
- `grep -ri birmanat` по репозиторию (без `node_modules`, `dist`) не находит ничего,
  кроме осознанно оставленного в `.claude/plan-branching.md` описания второго инстанса.
- `apps/birmanat-bank/` удалён, `docker compose config` валиден для обоих compose-файлов.
- Все тесты зелёные, сборка бэкенда и фронта проходит.
