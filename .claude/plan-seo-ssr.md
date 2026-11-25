# План: SEO и ИИ-поиск — блок 1 (серверная вставка контента)

Ветка: bmb-tickets. Коммит после успешной сборки, push — только по просьбе.

## Решение
Фронт — статический nginx, бэкенд — отдельный контейнер, `index.html` бэкенду недоступен.
Поэтому nginx фронта включает SSI для `index.html` и подставляет два фрагмента от бэкенда:
`<head>` (title, description, canonical, robots, OG, JSON-LD) и `<body>` (текст страницы
внутри `#root`, React потом заменяет его своим рендером). HTML один и тот же для людей
и ботов — не клоакинг. Отдельная ветка для мессенджеров (link-preview map) больше не нужна.

## Пункты
- [x] Ревью (в чате)
- [x] Бэкенд: вынести расчёт свободных мест зон в сервис (DRY с `routes/zones.ts`)
- [x] Бэкенд: `services/seo/*` — модель страницы, head/body-рендер, JSON-LD MusicEvent, sitemap
- [x] Бэкенд: роут `/api/seo/{head,body}/*` и `/api/seo/sitemap.xml`, удалить `/e` preview-роут
- [x] Тесты на чистые функции рендера (vitest)
- [x] Nginx фронта: SSI для index.html, `/__seo/` internal → бэкенд, `/sitemap.xml`; убрать map
- [x] robots.txt: Disallow служебных путей + Sitemap
- [x] index.html: SSI-директивы вместо статичных мета; favicon во всех html
- [x] Тексты: title главной/страницы концерта (ru/az/en), alt постеров
- [x] Проверка: typecheck/test бэкенда, build фронта (nginx в docker не прогнан — Docker Desktop не стартует; проверить curl'ом после деплоя)
- [x] Коммит

## Блок 2 (не в этой задаче)
- Поля площадки/адреса у мероприятия → `Event.location`
- Языковые URL (`?lang=az`) + hreflang, рендер описаний az/en
- Прошедшие/скрытые мероприятия: страница «концерт прошёл» вместо soft-404
- Основной сайт birmanat.band: `MusicGroup.event` + ссылки на конкретные концерты
