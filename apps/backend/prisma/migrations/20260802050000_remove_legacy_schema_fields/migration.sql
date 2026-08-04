-- Drop legacy floor-plan positioning fields (Zone.layoutData, ZoneTable.layoutData)
-- and the never-populated Seat.label. The legacy "Schema" editor (positioning
-- zones over a venue floor-plan photo) was only ever used for test data before
-- the grid-based approach replaced it — confirmed never used for a real event.
ALTER TABLE "Zone" DROP COLUMN "layoutData";
ALTER TABLE "ZoneTable" DROP COLUMN "layoutData";
ALTER TABLE "Seat" DROP COLUMN "label";

-- Drop the EXPIRED value from TicketStatus. It was only ever set by an
-- auto-expiry cron job that has been disabled since online payment isn't
-- wired up (see services/cron.ts) — no ticket has ever reached this status.
ALTER TYPE "TicketStatus" RENAME TO "TicketStatus_old";
CREATE TYPE "TicketStatus" AS ENUM ('BOOKED', 'PENDING', 'CONFIRMED', 'REJECTED');
ALTER TABLE "Ticket" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Ticket" ALTER COLUMN "status" TYPE "TicketStatus" USING ("status"::text::"TicketStatus");
ALTER TABLE "Ticket" ALTER COLUMN "status" SET DEFAULT 'BOOKED';
DROP TYPE "TicketStatus_old";
