-- CreateEnum
CREATE TYPE "ZoneType" AS ENUM ('GENERAL', 'SEATED', 'TABLE');

-- CreateEnum
CREATE TYPE "TableShape" AS ENUM ('ROUND', 'RECT');

-- AlterTable
ALTER TABLE "Zone" ADD COLUMN "type" "ZoneType" NOT NULL DEFAULT 'GENERAL',
                   ADD COLUMN "layoutData" JSONB;

-- CreateTable
CREATE TABLE "Seat" (
    "id"           TEXT NOT NULL,
    "zoneId"       TEXT NOT NULL,
    "number"       INTEGER NOT NULL,
    "row"          INTEGER NOT NULL,
    "sectionIndex" INTEGER NOT NULL DEFAULT 0,
    "posInSection" INTEGER NOT NULL,
    "label"        TEXT,

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoneTable" (
    "id"         TEXT NOT NULL,
    "zoneId"     TEXT NOT NULL,
    "number"     INTEGER NOT NULL,
    "shape"      "TableShape" NOT NULL DEFAULT 'ROUND',
    "chairCount" INTEGER NOT NULL,
    "layoutData" JSONB,

    CONSTRAINT "ZoneTable_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "seatId"  TEXT UNIQUE,
                     ADD COLUMN "tableId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Seat_zoneId_number_key" ON "Seat"("zoneId", "number");
CREATE UNIQUE INDEX "Seat_zoneId_row_sectionIndex_posInSection_key" ON "Seat"("zoneId", "row", "sectionIndex", "posInSection");
CREATE INDEX "Seat_zoneId_idx" ON "Seat"("zoneId");

CREATE UNIQUE INDEX "ZoneTable_zoneId_number_key" ON "ZoneTable"("zoneId", "number");
CREATE INDEX "ZoneTable_zoneId_idx" ON "ZoneTable"("zoneId");

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_zoneId_fkey"
    FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ZoneTable" ADD CONSTRAINT "ZoneTable_zoneId_fkey"
    FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_seatId_fkey"
    FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_tableId_fkey"
    FOREIGN KEY ("tableId") REFERENCES "ZoneTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
