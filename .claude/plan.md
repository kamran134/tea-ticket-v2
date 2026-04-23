# План: Визуальная схема зала + гибридные места

## Концепция
Зона (Zone) получает тип: `GENERAL` (без мест), `SEATED` (ряды/колонны), `TABLE` (столы).
Ticket привязывается к конкретному Seat или ZoneTable (оба опциональны).
Визуальная карта — SVG поверх фона зала; зоны позиционируются через layoutData.

---

## Этап 1: Схема БД + миграция ✅
- [x] Добавить `ZoneType` enum (`GENERAL`, `SEATED`, `TABLE`) в schema.prisma
- [x] Добавить `type ZoneType` и `layoutData Json?` в модель `Zone`
- [x] Создать модель `Seat` (zoneId, number, row, sectionIndex, posInSection, label?)
- [x] Создать модель `ZoneTable` (zoneId, number, shape, chairCount, layoutData?)
- [x] Добавить `seatId String? @unique` и `tableId String?` в `Ticket`
- [x] Создать SQL-миграцию (применить вручную: `psql < migration.sql`)

## Этап 2: Backend — новые роуты ✅
- [x] `GET /api/zones/:id/seats`
- [x] `POST /api/zones/:id/generate-seats`
- [x] `DELETE /api/zones/:id/seats`
- [x] `GET /api/zones/:id/tables`
- [x] `POST /api/zones/:id/generate-tables`
- [x] Обновить `POST /api/tickets/register` — seatId/tableId + валидация
- [x] Обновить `GET /api/zones` — available для всех типов
- [x] Обновить `PUT /api/zones/:id` — type и layoutData

## Этап 3: Frontend типы + API-сервис ✅
- [x] Обновить `Zone`, `Ticket`, добавить `Seat`, `ZoneTable`, `ZoneType`
- [x] Добавить методы: getSeats, generateSeats, deleteSeats, getTables, generateTables
- [x] Обновить `register` — seatId/tableId

## Этап 4: Админ UI ✅
- [x] `ZoneConfigurator` компонент: генератор секций (SEATED) + генератор столов (TABLE)
- [x] Интегрирован в список зон ManagePanel

## Этап 5: Пользовательский UI ✅
- [x] `SeatPicker` — grid мест по рядам и секциям
- [x] `TablePicker` — карточки столов с доступностью
- [x] `RegisterForm` — зоны как карточки, SeatPicker/TablePicker по типу зоны

## Этап 6: Визуальная схема зала ✅
- [x] `floorPlanImage String?` в модель `Venue` + миграция
- [x] `POST /api/venues/:id/upload-floor-plan` — загрузка фото зала
- [x] `VenueMap` компонент — CSS-positioned зоны поверх фото, кликабельные
- [x] `ZoneMapEditor` — drag-and-drop редактор + загрузка схемы + цвета зон
- [x] ManagePanel: вкладка «Схема» с ZoneMapEditor
- [x] RegisterForm: автопереключение на VenueMap когда есть позиции зон

---

## Порядок зависимостей
Этап 1 → Этап 2 → Этап 3 → Этапы 4 и 5 параллельно → Этап 6
