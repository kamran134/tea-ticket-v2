# Контекст: перенос изменений bank-emulation -> dev

## Зачем

Ветки `dev` и `bank-emulation` разошлись от `b6725af` (начало августа 2026) и с тех пор
развивались независимо:

- **`dev`** (деплоится на tea-ticket.com): эквайринг Kapital TXPG, удаление симулятора
  BirManatBank, ребрендинг в TeaTicket, спринты аудита (общая сетка `grid/gridGeometry`,
  `grid/zoneColors`, ESLint+Vitest, единый PrismaClient).
- **`bank-emulation`** (деплоится на tickets.birmanat.band, брендинг группы BirManatBand):
  UX схемы зала, продажа отдельных стульев, тема, QA-инфраструктура.

Владелец попросил перенести на `dev` всё полезное из `bank-emulation`, **кроме дизайна
хедеров и футеров** — на `dev` они намеренно скрыты на публичных страницах (коммит
`b404664`), потому что там брендинг чужой группы.

## Что решено переносить (подтверждено владельцем 04.09.2026)

Все 8 коммитов, в хронологическом порядке:

| # | Коммит | Что |
|---|---|---|
| 1 | `495ce98` | Аккордеон билетов в админке |
| 2 | `1582a8a` | QA-инфраструктура: коды ошибок, TEST_MODE, testid, Playwright |
| 3 | `1b49b90` | 500 на просроченном билете + частичный unique-индекс |
| 4 | `ced5906` | Страница билета при истёкшей оплате |
| 5 | `8453fae` | 409 SEAT_ALREADY_BOOKED вместо 500 |
| 6 | `9d8ab4a` | Продажа отдельных стульев за столом |
| 7 | `b7902a8` | Редизайн схемы выбора мест (`seatmap/*`) |
| 8 | `91dabc8` | Светлая/тёмная тема |

## Что НЕ переносить

- `fd207ae` — CI/CD для tickets.birmanat.band. Переименовывает `deploy.yml` в
  `deploy-bmb.yml`, то есть снесёт деплой tea-ticket.com.
- `829ce11` (i18n-зависимости) и `351ce5e` / `794fb5f` (45 колонок, фантомные зоны) —
  уже есть на `dev`.

## Что защищать при разрешении конфликтов

Всё это `dev` получил уже после точки расхождения, и `bank-emulation` про это не знает:

1. **Header/Footer** — на публичных страницах скрыты, брендинг BirManatBand не возвращать.
2. **Брендинг TeaTicket** — `ticket-email-template.ts`, `email/config.ts`, `lib/site.ts`.
   Не откатывать на BirManat.
3. **Симулятор** — `apps/birmanat-bank/`, `bank-provider.ts`, `docker-compose.bank.yml`
   удалены. При modify/delete конфликте оставлять удалённым.
4. **Эквайринг Kapital** — `services/payments/*`, особенно `payment-service.ts`
   (`syncFromProvider`, троттлинг, `applyProviderState` со сверкой суммы) и
   `kapital-provider.ts`. Ветка их не видела.
5. **Общая сетка** — `components/grid/gridGeometry.ts` и `grid/zoneColors.ts` (спринт 4).
   `bank-emulation` правит `VenueGridMap`/`GridCanvas` в их дорефакторном виде.
6. **`.github/workflows/deploy.yml`** и `infra/nginx/tea-ticket.com.conf` — не трогать.

## Порядок работы

Работа идёт в ветке `port-from-bank-emulation` от `dev`. В `dev` мержится только после
того, как всё зелёное: пуш в `dev` немедленно запускает деплой на прод.

## Как гонять тесты на этой машине

Порт 5432 занят **чужим проектом** (`tnc-postgres-dev`) — трогать его нельзя.
Одноразовый Postgres для тестов:

```
docker run -d --name teaticket-vitest-pg -e POSTGRES_DB=teaticket_test \
  -e POSTGRES_USER=teaticket -e POSTGRES_PASSWORD=secret -p 55432:5432 postgres:17-alpine
DATABASE_URL='postgresql://teaticket:secret@localhost:55432/teaticket_test' \
  npm run test --workspace=apps/backend
```

База на `dev` до начала работ: 87 тестов, 9 файлов, всё зелёное.

Ещё две особенности этой машины:

- После правок `schema.prisma` (их тянут `1b49b90` и `9d8ab4a`) `tsc` бэкенда падает,
  пока не выполнить `npx prisma generate --schema apps/backend/prisma/schema.prisma`.
  Ошибки при этом выглядят как несвязанные — сгенерированный клиент устарел.
- `vite build` падает с `Cannot find module @rollup/rollup-win32-x64-msvc`: в корневом
  `node_modules` нет платформенных бинарников. Лечится
  `npm install --no-save @rollup/rollup-win32-x64-msvc @esbuild/win32-x64`.
  Именно `--no-save`: `package-lock.json` в рабочей копии изменён не нами (в нём вырезаны
  все платформенные optional-зависимости `@esbuild/*`), трогать его не надо.
