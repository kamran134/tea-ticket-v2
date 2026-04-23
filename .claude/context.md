# Контекст: Визуальная схема зала

## Задача
Добавить гибридную систему мест: зоны без мест (стоячие), зоны с пронумерованными местами (ряды/секции), зоны со столами. Плюс визуальная интерактивная схема зала.

## Ключевые решения

### Тип зоны
- `GENERAL` — текущее поведение, capacity-based, без мест
- `SEATED` — нумерованные места, ряды + визуальные секции/колонны
- `TABLE` — столы (ROUND/RECT) с количеством стульев

### Нумерация мест (SEATED)
- Сквозная по всей зоне: место 1, 2, 3... N
- Визуально делится на секции (колонны), но нумерация продолжается
- Порядок: `row-first` (ряд 1 колонны 0, 1, 2, потом ряд 2...) или `section-first`
- Seat хранит: `number` (сквозной), `row`, `sectionIndex`, `posInSection`

### Столы (TABLE)
- Ticket привязан к столу (`tableId`), но не к конкретному стулу
- Несколько билетов на один стол (capacity = chairCount стола)
- Доступность = chairCount - count(tickets WHERE tableId = X)

### Ticket изменения
- `seatId String? @unique` — для SEATED (один билет = одно место)
- `tableId String?` — для TABLE (несколько билетов = несколько стульев за столом)
- Оба поля null для GENERAL зон

### Визуальная схема
- SVG-компонент поверх фото/цвета зала
- Зоны хранят `layoutData: { x, y, w, h, color }` в % от размера схемы
- На первом этапе позиции задаются вручную, потом drag-and-drop

## Файлы которые меняются
- `prisma/schema.prisma` — новые модели и поля
- `src/routes/zones.ts` — расширение существующего роутера + новые роуты
- `src/routes/tickets.ts` — обновление регистрации
- `apps/frontend/src/types/index.ts` — новые типы
- `apps/frontend/src/services/api.ts` — новые методы
- `apps/frontend/src/components/ManagePanel.tsx` — admin UI
- `apps/frontend/src/components/RegisterForm.tsx` — user UI → VenueMap

## Новые файлы
- `apps/frontend/src/components/SeatPicker.tsx` — grid мест для SEATED
- `apps/frontend/src/components/TablePicker.tsx` — список столов для TABLE  
- `apps/frontend/src/components/VenueMap.tsx` — SVG-схема зала (Этап 6)

## Ограничения
- Нельзя удалить места если на них есть купленные билеты (BOOKED/PENDING/CONFIRMED)
- При смене типа зоны с SEATED на другой — предупреждение если есть места
- Автогенерация seats — транзакция: удалить старые (если нет билетов) + создать новые
