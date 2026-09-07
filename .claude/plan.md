# План: мероприятия только автора

- [x] Prisma: `Venue.createdById` + миграция `venue_created_by` с backfill на Super Admin
- [x] `assertVenueAccess` / `loadOwnedVenue` / `venueOwnerWhere`
- [x] Фильтр `GET /venues?all=true`, `createdById` на POST, 403 на чужие PATCH/grid/upload
- [x] Зоны и тикеты (список, status, delete, receipt, checkin) — только свои события
- [x] Интеграционный тест: свои видны, чужие 403, Super Admin видит всё
- [x] typecheck затронутых файлов
