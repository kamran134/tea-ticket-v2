-- Drop legacy floor-plan positioning fields (Zone.layoutData, ZoneTable.layoutData)
-- and the never-populated Seat.label. The legacy "Schema" editor (positioning
-- zones over a venue floor-plan photo) was only ever used for test data before
-- the grid-based approach replaced it — confirmed never used for a real event.
-- IF EXISTS makes recovery safe if an earlier failed production attempt
-- executed any statements before PostgreSQL rolled the migration back.
ALTER TABLE "Zone" DROP COLUMN IF EXISTS "layoutData";
ALTER TABLE "ZoneTable" DROP COLUMN IF EXISTS "layoutData";
ALTER TABLE "Seat" DROP COLUMN IF EXISTS "label";

-- Keep TicketStatus.EXPIRED: online acquiring makes booking expiry reachable,
-- and production already contains expired tickets.
