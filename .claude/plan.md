# План: юридические страницы + Header/Footer

## Этап 1. Анализ

- [x] Локализация: i18next, `ru`/`az`/`en`, `changeLanguage` в Header, язык в localStorage
- [x] Роутинг: MPA, `main.tsx` regex `/e/:slug`, nginx `try_files` для `/e/`
- [x] Header/Footer закомментированы из‑за брендинга Bir Manat Band
- [x] Документы: политика / соглашение / возврат билетов, по 3 языка

## Этап 2. Реализация

- [x] Сырые тексты в `apps/frontend/src/legal/documents/`
- [x] Каталог страниц, резолв языка с fallback
- [x] `LegalPage` + роутинг `/privacy-policy`, `/terms`, `/refund-policy`
- [x] nginx для новых путей
- [x] `PublicLayout` с существующими Header/Footer
- [x] Ссылки на документы в Footer
- [x] i18n-ключи UI (не юридический текст)

## Этап 3. Проверка

- [x] `tsc --noEmit` фронта
- [x] vitest затронутых тестов
- [x] коммит
