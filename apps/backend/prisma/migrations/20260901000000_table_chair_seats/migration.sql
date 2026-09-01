-- Individual purchasable chairs at a table: Seat.tableId links a Seat row
-- to its ZoneTable. Chair identity is (tableId, posInSection); display
-- number is posInSection+1. Unique (zoneId, number) uses table.number*100+chair.

ALTER TABLE "Seat" ADD COLUMN "tableId" TEXT;

ALTER TABLE "Seat" ADD CONSTRAINT "Seat_tableId_fkey"
  FOREIGN KEY ("tableId") REFERENCES "ZoneTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Seat_tableId_idx" ON "Seat"("tableId");

-- One Seat per existing chair. Deterministic ids so the insert is idempotent
-- if migrate deploy is retried after a partial apply.
INSERT INTO "Seat" (id, "zoneId", "tableId", number, row, "sectionIndex", "posInSection")
SELECT
  'tseat_' || t.id || '_' || g.i,
  t."zoneId",
  t.id,
  t.number * 100 + g.i,
  COALESCE(t.row, 0),
  CASE WHEN t.col IS NULL THEN 10000 + t.number ELSE t.col + 1 END,
  g.i - 1
FROM "ZoneTable" t
CROSS JOIN LATERAL generate_series(1, t."chairCount") AS g(i)
WHERE NOT EXISTS (
  SELECT 1 FROM "Seat" s WHERE s."tableId" = t.id AND s."posInSection" = g.i - 1
);

-- Bind live table tickets that have no seat yet, in purchase order, so
-- currently occupied chairs stay occupied after the cutover.
WITH ranked AS (
  SELECT
    tk.id AS ticket_id,
    tk."tableId" AS table_id,
    ROW_NUMBER() OVER (PARTITION BY tk."tableId" ORDER BY tk."createdAt" ASC, tk.id ASC) - 1 AS idx
  FROM "Ticket" tk
  WHERE tk."tableId" IS NOT NULL
    AND tk."seatId" IS NULL
    AND tk.status IN ('BOOKED', 'PENDING', 'CONFIRMED')
)
UPDATE "Ticket" tk
SET "seatId" = s.id
FROM ranked r
JOIN "Seat" s ON s."tableId" = r.table_id AND s."posInSection" = r.idx
WHERE tk.id = r.ticket_id;
