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
- [x] Проверка: typecheck/test бэкенда, build фронта + nginx 1.27 в docker с бэкендом-заглушкой: все пути, Host в подзапросе, медленный/упавший бэкенд
- [x] Коммит

## Блок 2
- [x] Venue.venueName / venueAddress: схема + миграция, zod в routes/venues, админка (создание/редактирование), показ на странице концерта
- [x] JSON-LD `location` из площадки/адреса (город — запасной вариант), строка фактов в body
- [x] Прошедший концерт: SEO-страница «концерт прошёл» (noindex, без offers, ссылка на афишу), убрать из sitemap; во фронте — плашка вместо покупки
- [x] Скрытое/несуществующее: body с текстом «не найдено» + ссылка на афишу (не пустой #root)
- [x] `?lang=az|en`: фронт берёт язык из URL (приоритет над localStorage) и пишет его в URL при смене; SEO-копия ru/az/en, описание по языку, hreflang + x-default, canonical с lang, og:locale, `<html lang>` через nginx map
- [x] Тесты, typecheck, build фронта
- [x] Коммит
- Вне репозитория: основной сайт birmanat.band — `MusicGroup.event` + ссылки на концерты
