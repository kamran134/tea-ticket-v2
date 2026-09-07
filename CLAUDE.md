# Tea Ticket v2 — карта проекта

> Стиль работы, язык общения и правила по планам — в [.claude/CLAUDE.md](.claude/CLAUDE.md).
> Известные проблемы и техдолг — в [AUDIT.md](AUDIT.md) (читать перед рефакторингом).

## Что это

Система продажи билетов на чайные церемонии / мероприятия (Баку, валюта — манат `₼`).
Продакшн: https://tea-ticket.com. Хобби-проект одного разработчика, один админ на всю систему.

Поток покупателя: афиша → страница мероприятия `/e/:slug` → выбор мест на схеме зала →
корзина → ввод имени/телефона/email → билет со ссылкой `/ticket?id=...` → админ
подтверждает вручную → на билете появляется QR → на входе админ сканирует QR.

**Онлайн-оплата не подключена.** Билет создаётся в статусе `BOOKED`, дальше организатор
связывается вручную. Загрузка чека (`BOOKED → PENDING`) осталась в API, но в UI покупателя
её больше нет. Из-за этого cron авто-протухания брони отключён (`services/cron.ts` — пустая
заглушка), а статус `EXPIRED` недостижим.

## Стек

- **Монорепо**: npm workspaces, `apps/backend` + `apps/frontend`.
- **Backend**: Express 4 + TypeScript (CommonJS) + Prisma 5 + PostgreSQL 17. Валидация — zod.
  Авторизация админки — `AdminUser` + `AdminRole` с granular permissions, JWT на 24 часа.
- **Frontend**: React 18 + Vite (MPA, 4 точки входа) + Tailwind 3. Роутера нет.
- **Файлы**: загружаются на локальный диск контейнера (`services/storage.ts`), том
  `/opt/tea-ticket-v2/uploads`, раздаются через `express.static('/uploads')`.
  S3 в `.env.example` описан, но **не используется**.
- **Деплой**: GitHub Actions → образы в ghcr.io → SSH на сервер → `docker compose pull/up`.
  Снаружи — системный nginx (`infra/nginx/tea-ticket.com.conf`) + Cloudflare.

## Точки входа фронта

| URL | HTML | Компонент | Кто |
|---|---|---|---|
| `/` | `index.html` | `Afisha` | все |
| `/e/:slug` | `index.html` (роутинг regex в `main.tsx`) | `RegisterForm` | покупатель |
| `/privacy-policy`, `/terms`, `/refund-policy` | `index.html` | `LegalPage` | все |
| `/ticket?id=...` | `ticket.html` | `TicketView` | покупатель |
| `/manage` | `manage.html` | `ManagePanel` | админ |
| `/admin` | `admin.html` | `AdminScanner` | админ на входе |

`main.tsx` разводит `/`, `/e/:slug` и юридические URL по `window.location.pathname`. Nginx фронта отдаёт
`index.html` для `/e/` и `/privacy-policy` `/terms` `/refund-policy`.

## Модель данных (`apps/backend/prisma/schema.prisma`)

```
Venue ──< Zone ──< Seat          (SEATED: 1 клетка сетки = 1 Seat)
      │        └─< ZoneTable     (TABLE:  прямоугольный footprint = 1 стол)
      └──────────< Ticket        (1 билет = 1 человек)
GridTemplate (глобальный, не привязан к Venue)
AdminUser ──< AdminRole          (одна роль на пользователя, permissions String[])
      └────< Venue               (createdById, onDelete SetNull)
AdminAuditLog                    (кто что сделал в админке)
```

- `Venue.gridLayout: Json` — `{ rows, cols, cells: string[][] }`, **главный источник правды
  по схеме зала**. Значение клетки: `'empty' | 'blocked' | 'stage' | <Zone.id>`.
- `Zone.type`:
  - `SEATED` — каждая закрашенная клетка = реальный `Seat`. Координаты клетки лежат в
    `Seat.row` (grid row) и `Seat.posInSection` (grid col), `sectionIndex` всегда `0`.
  - `GENERAL` — закрашенная область только рисуется; `Seat` нет, продаётся `Zone.capacity`
    штук «в зону».
  - `TABLE` — связная прямоугольная область = один `ZoneTable`
    (`row/col` — якорь, `rows/cols` — размер footprint). Мест за столом — `Zone.tableChairs`.
- `Ticket` — одна строка на человека. Группа = общий `groupId`, равный id первого билета
  («главного»). QR кодирует `groupId ?? id`.
- Активные статусы (занимают место): `BOOKED`, `PENDING`, `CONFIRMED`.

**Легаси-путь**, который ещё жив в коде, но скрыт из UI: генератор мест по рядам/секциям
(`ZoneConfigurator` → `POST /zones/:id/generate-seats`), позиционирование зон поверх
фотографии зала (`Zone.layoutData` + `ZoneMapEditor`/`VenueMap`), генератор столов пачкой
(`generate-tables`, столы с `row/col = null`). Вкладки «Зоны» и «Схема (старая)» в
`ManagePanel` **недоступны** — их нет в списке отрисовки табов (`ManagePanel.tsx:425`).

## API (`apps/backend/src/routes/`)

Формат ответа везде `{ success: boolean, data?: T, error?: string }`.
`requireAuth` проверяет JWT и грузит `req.actor` из БД; `requirePermission('events.edit')`
проверяет право. Super Admin проходит любую проверку прав и видит все мероприятия;
остальные админы — только свои (`Venue.createdById`). Публичная афиша не фильтруется.

| Метод | Путь | Auth | Комментарий |
|---|---|---|---|
| POST | `/api/auth/login` | — | `{ email, password }` → JWT 24ч + user |
| GET | `/api/auth/me` | ✔ | текущий админ и его permissions |
| POST | `/api/auth/logout` | ✔ | инкремент `tokenVersion` |
| POST | `/api/auth/change-password` | ✔ | свой пароль |
| GET/POST/PATCH/DELETE | `/api/admin-users[/:id]` | ✔ | `users.*` |
| GET/POST/PATCH/DELETE | `/api/roles[/:id]` | ✔ | `roles.*` |
| GET | `/api/permissions` | ✔ | каталог прав |
| GET | `/api/audit-log` | ✔ | `audit.view` |
| GET | `/api/venues?all&upcoming` | `all=true` → `events.view` | `all=true` только свои (Super Admin — все); публичные режимы без auth |
| GET | `/api/venues/by-slug/:slug` | — | только `active` |
| GET | `/api/venues/slug-available` | `events.create` | |
| POST/PATCH | `/api/venues[/:id]` | `events.create` / `events.edit` | POST пишет `createdById`; PATCH чужого → 403 |
| PUT | `/api/venues/:id/grid-layout` | `events.edit` | **ключевой**: в одной транзакции синхронизирует `Seat` и `ZoneTable` с сеткой |
| POST | `/api/venues/:id/upload-{floor-plan,poster}` | `events.edit` | только своё мероприятие |
| GET | `/api/zones?venueId` | — | считает `available` по типу зоны |
| POST/PUT/DELETE | `/api/zones[/:id]` | `events.edit` | только зоны своего мероприятия |
| GET | `/api/zones/:id/{seats,tables}` | — | |
| POST | `/api/tickets/register` | — | корзина из нескольких зон → N билетов в одной транзакции |
| GET | `/api/tickets/:id`, `/group/:groupId` | — | публичные, контакты урезаны |
| GET | `/api/tickets?status&venueId` | `tickets.view` | только билеты своих мероприятий |
| PATCH | `/api/tickets/:id/status` | `tickets.edit` | подтверждение/отклонение — **на всю группу**; чужое мероприятие → 403 |
| POST | `/api/tickets/:id/checkin`, `/group/:groupId/checkin` | `tickets.checkin` | Super Admin — любой билет, остальные — только свои события |
| DELETE | `/api/tickets/:id` | `tickets.delete` | только билеты своих мероприятий |
| GET/POST/DELETE | `/api/grid-templates` | `events.view` / `events.create` / `events.delete` | шаблоны схем залов |

## Ключевые компоненты фронта

- `GridMapEditor.tsx` (1157 стр.) — редактор сетки в админке: создание/редактирование зон,
  рисование, шаблоны, расчёт ожидаемой выручки. Самый сложный файл проекта.
- `VenueGridMap.tsx` (508 стр.) — та же сетка «для покупателя», полноэкранный оверлей.
  Дублирует значительную часть логики отрисовки из `GridMapEditor` (см. AUDIT A1).
- `RegisterForm.tsx` (589 стр.) — страница мероприятия + корзина + оформление.
- `ManagePanel.tsx` — админка: мероприятия, схема, билеты, статистика, пользователи, роли, журнал.
- `TableIcon.tsx` — SVG мебели и функция `tableFootprint(shape, chairs)` — сколько клеток
  занимает стол. Редактор считает footprint ею, а БД хранит результат в `ZoneTable.rows/cols`.

## Разработка

```bash
docker compose -f docker-compose.dev.yml up -d db   # только БД
npm run dev:backend                                  # :3000
npm run dev:frontend                                 # :5173 (нужен VITE_API_URL=http://localhost:3000)
```

Env — по `.env.example`. Первый Super Admin создаётся при старте из `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH`
(`node -e "require('bcryptjs').hash('pass',10).then(console.log)"`). Дальше вход по email+паролю.
Миграции: `npm run db:migrate --workspace=apps/backend`. В контейнере `prisma migrate deploy`
выполняется в `CMD` при старте.

Тестов, ESLint и Prettier в проекте **нет** — `// eslint-disable-next-line` в коде ничего не
отключает, конфига не существует.
