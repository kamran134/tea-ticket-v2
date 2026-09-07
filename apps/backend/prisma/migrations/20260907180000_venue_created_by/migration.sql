-- AlterTable
ALTER TABLE "Venue" ADD COLUMN "createdById" TEXT;

-- CreateIndex
CREATE INDEX "Venue_createdById_idx" ON "Venue"("createdById");

-- Existing events stay visible to the owner account so they do not vanish
-- from the admin panel after this migration.
UPDATE "Venue"
SET "createdById" = (
  SELECT u."id"
  FROM "AdminUser" u
  INNER JOIN "AdminRole" r ON r."id" = u."roleId"
  WHERE r."isSuperAdmin" = true
  ORDER BY u."createdAt" ASC
  LIMIT 1
)
WHERE "createdById" IS NULL;

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
