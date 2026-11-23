# План: адаптация под BIR MANAT BAND

Ветка: bmb-tickets. Коммит — после успешной сборки (правило из .claude/CLAUDE.md), push — только по отдельной просьбе.

## Пункты
- [x] 1. Логотип: `apps/frontend/src/assets/brand-logo.png` заменить на BIR MANAT BAND (обрезка по прозрачности, источник — вложение `BMB logo 2025-07.png`).
- [x] 2. Логотип в соцпревью: `apps/frontend/public/og-image.jpg` перерисовать с новым логотипом (1200×630, тёмный фон как был).
- [x] 3. Header/Footer: `alt` и размеры под новый логотип (соотношение сторон изменилось: 240×43 → 977×383).
- [x] 4. Заголовок афиши (зелёный): `afisha.title` → «Расписание концертов» / «Konsertlərin cədvəli» / «Concert schedule».
- [x] 5. Почта → `support@birmanat.band` везде: фронт (`lib/site.ts`, `LegalPage.tsx`, юридические .txt), бэк (`services/email/config.ts`, `docker-compose*.yml`, `.env.example`, `tests/setup.ts`). Локальные `.env` (в .gitignore) не трогаю.
- [x] 6. Страница «О нас»: `legal/about.ts` → тексты из `bir_manat_band_about_us.md` (ru/az/en), структура секций; реквизиты (юр. блок) не меняются.
- [x] 7. Обновить `legal.test.ts` под новую структуру `ABOUT_COPY`.
- [x] 8. Сборка: `tsc --noEmit` фронт и бэк, тесты; коммит.

## Вне охвата (сознательно не трогаю, сообщить пользователю)
- Домен `stolits.art` / `tea-ticket.com` в SITE_URL, og:url, CORS, nginx — не просили.
- Название «StolitsArt Ticket» в заголовках вкладок, meta и письмах — не просили.
