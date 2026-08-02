-- AlterTable: allow TABLE-type zones to be painted on the grid, one table per cell
ALTER TABLE "Zone" ADD COLUMN "tableChairs" INTEGER;
ALTER TABLE "ZoneTable" ADD COLUMN "row" INTEGER;
ALTER TABLE "ZoneTable" ADD COLUMN "col" INTEGER;
