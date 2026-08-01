-- AlterTable
ALTER TABLE "Venue" ADD COLUMN "posterImage" TEXT;
ALTER TABLE "Venue" ADD COLUMN "slug" TEXT;

-- Backfill: existing venues get their id as a safe, unique placeholder slug
-- (admin can rename to something human-friendly afterwards)
UPDATE "Venue" SET "slug" = "id" WHERE "slug" IS NULL;

ALTER TABLE "Venue" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Venue_slug_key" ON "Venue"("slug");
