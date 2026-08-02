-- AlterEnum: tables can now be drawn as round, rectangular, or a sofa/lounge
ALTER TYPE "TableShape" ADD VALUE 'SOFA';

-- AlterTable: a table now occupies a rectangular footprint on the grid
-- (row/col = top-left anchor, rows/cols = footprint size) instead of one cell
ALTER TABLE "ZoneTable" ADD COLUMN "rows" INTEGER;
ALTER TABLE "ZoneTable" ADD COLUMN "cols" INTEGER;

-- AlterTable: default shape for tables painted in this zone
ALTER TABLE "Zone" ADD COLUMN "tableShape" "TableShape";
