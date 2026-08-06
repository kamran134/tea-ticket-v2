# План: разделение веток и настройка CI/CD

> Задача для исполнителя. Все факты ниже **уже проверены** — не перепроверяй их заново,
> не лазь на сервер, не переустанавливай `node_modules`. Экономь токены.

## Проверенные факты (не проверять повторно)

- `origin/bank-emulation` (`0d125e3`) — **надмножество** `master`. Проверено:
  `git log origin/bank-emulation..master` пуст. Там уже есть банкинг + i18n + правки хедера.
  Вторую ветку создавать НЕ надо, она готова.
- `master` (`b6725af`) = `f855029` + мерж банкинга (`ae2903c`) + 3 коммита i18n/хедер.
- `f855029 grid fix` — последнее состояние песочницы **до** банкинга. Там цел
  `infra/nginx/tea-ticket.com.conf` (в банковской ветке этот файл удалён) и рабочий `deploy.yml`.
- i18n-коммиты правят `Header.tsx` / `Footer.tsx` / `lib/site.ts`, а эти файлы пришли **из**
  банковской ветки (коммит `274718b`). Поэтому i18n **нельзя** перенести на `f855029` без
  ручного разбора конфликтов (проверено черновым `git revert` — 8 конфликтных файлов).
  Вывод: `dev` = ровно `f855029`, i18n остаётся только в банковской ветке.
- Прод-сервер tea-ticket и сервер `tickets.birmanat.band` — **разные машины**,
  конфликта портов нет.
- Последний деплой в master упал на `invalid spec: :/app/uploads` (нет `UPLOADS_PATH`),
  контейнеры не пересоздались.

## Целевая схема

| Ветка | Содержимое | Сервер | Workflow | Теги образов |
|---|---|---|---|---|
| `dev` | `f855029`, без банкинга | tea-ticket (песочница) | `deploy.yml`, триггер на `dev` | `:dev` |
| `bank-emulation` | всё (банкинг + i18n) | второй, `tickets.birmanat.band` | новый `deploy-bmb.yml` | `:bmb` |
| `master` | пока не трогаем | — | — | — |

**Критично:** обе ветки пушат в один ghcr-репозиторий
(`ghcr.io/kamran134/tea-ticket-v2/{backend,frontend}`). Без разных тегов они затрут образы
друг друга. Сейчас в `deploy.yml` стоит `type=raw,value=latest,enable={{is_default_branch}}`
— на ветке `dev` это условие вообще не сработает (default branch = master), тег надо задать явно.

---

## Шаг 0. Спросить у пользователя (до любых git-операций)

1. **Второй сервер:** host, SSH-пользователь, порт, путь деплоя
   (ожидается `/var/www/tickets.birmanatband`). Нужно для GitHub Secrets.
2. **nginx + TLS для `tickets.birmanat.band`** на втором сервере уже настроен, включая
   `location /bank/` (проксирование на порт 8082)? Если нет — это пользователь делает сам
   один раз, CI не будет трогать nginx на этом сервере.
3. **Имя второй ветки:** оставить `bank-emulation` или переименовать (например `bmb`)?
4. **`master`:** оставить как есть до отдельной задачи (рекомендуется) или сразу откатить
   на `f855029`? Откат = force-push в уже запушенную ветку + автоматический ре-деплой →
   нужно явное подтверждение пользователя.

## Шаг 1. Ветка `dev`

```
git branch dev f855029
git push -u origin dev
```

Затем на `dev` в `.github/workflows/deploy.yml`:
- триггер → `branches: [dev]`;
- в обоих `metadata-action`: убрать `enable={{is_default_branch}}`, поставить
  `type=raw,value=dev`;
- в SSH-скрипте добавить экспорт:
  `BACKEND_IMAGE=ghcr.io/${GITHUB_REPOSITORY}/backend:dev` и аналогично `FRONTEND_IMAGE`.

Остальное в `deploy.yml` на этой ветке трогать не нужно — там всё рабочее (nginx-конфиг цел,
`docker-compose.yml` старый, с захардкоженным `/opt/tea-ticket-v2/uploads`).

## Шаг 2. Секреты для второго сервера

**Рекомендуемый путь (меньше возни):** пользователь один раз кладёт готовый `.env` руками
в `$DEPLOY_PATH` на втором сервере. `docker compose` подхватывает `.env` из рабочей
директории автоматически — тогда в CI не нужно экспортировать ни одной прикладной
переменной, а из GitHub Secrets нужны только SSH-доступы:
`BMB_SSH_HOST`, `BMB_SSH_USERNAME`, `BMB_SSH_KEY`, `BMB_SSH_PORT`, `BMB_DEPLOY_PATH`.

Секреты заводит пользователь сам (Settings → Secrets and variables → Actions).
Значения не запрашивать и не вставлять в файлы репозитория.

## Шаг 3. Ветка `bank-emulation` — новый workflow

Создать `.github/workflows/deploy-bmb.yml` (только на этой ветке):
- триггер: push в эту ветку + `workflow_dispatch`;
- три build-job по образцу существующих: `backend` (`./apps/backend`),
  `frontend` (`./apps/frontend`), `birmanat-bank` (`./apps/birmanat-bank`) — тег `:bmb`;
- deploy-job: `scp` только `docker-compose.yml` → по SSH `docker login ghcr.io`,
  экспорт `BACKEND_IMAGE`/`FRONTEND_IMAGE`/`BIRMANAT_BANK_IMAGE` с тегом `:bmb`,
  затем `docker compose pull && docker compose up -d --remove-orphans`;
- **nginx не трогать** — `infra/nginx/tea-ticket.com.conf` на этой ветке не существует,
  а конфиг второго домена пользователь ведёт сам.

Проверить в `docker-compose.yml` этой ветки, что сервис `birmanat-bank` берёт
`${BIRMANAT_BANK_IMAGE}` (сейчас у него есть и `build:`, и `image:` — при `pull` это
работает, но образ должен указывать на ghcr).

## Шаг 4. Утёкший секрет

В `.env.example` (ветка `bank-emulation`) последняя строка — реальный боевой
`whsec_ObksM/MoAreN+X7JF1AIydSO0nqxUvSp`. Удалить эту строку.
Пользователю отдельно сказать: перевыпустить секрет в Resend — он уже в истории
публичного репозитория, удаление из файла его не отзывает.

## Шаг 5. Проверка

- Локально: `npm run db:generate --workspace=apps/backend`, затем `npm run build` для обоих
  workspace. (`prisma generate` обязателен — без него backend не собирается.)
- На сервер не ходить, деплой проверяет пользователь сам.

## Шаг 6. Позже, отдельной задачей

`master` → чистая прод-ветка: решить, что из `dev`/`bank-emulation` туда попадает,
собрать прод-workflow.
