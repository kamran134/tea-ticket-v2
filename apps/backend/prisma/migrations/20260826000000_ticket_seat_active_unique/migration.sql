-- Expired/rejected tickets used to keep a global unique lock on seatId, so
-- the map showed the seat as free while INSERT failed. Scope uniqueness to
-- live bookings only; history rows may share a seatId.
ALTER TABLE "Ticket" DROP CONSTRAINT IF EXISTS "Ticket_seatId_key";
DROP INDEX IF EXISTS "Ticket_seatId_key";

CREATE UNIQUE INDEX "Ticket_seatId_active_key"
  ON "Ticket" ("seatId")
  WHERE "seatId" IS NOT NULL
    AND status IN ('BOOKED', 'PENDING', 'CONFIRMED');

CREATE INDEX IF NOT EXISTS "Ticket_seatId_idx" ON "Ticket" ("seatId");
