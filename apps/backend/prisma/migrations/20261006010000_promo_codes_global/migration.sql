-- A promo with no venue applies to every event. PostgreSQL unique indexes
-- treat NULL as distinct, so global codes need their own uniqueness rule.
ALTER TABLE "PromoCode" ALTER COLUMN "venueId" DROP NOT NULL;

CREATE UNIQUE INDEX "PromoCode_global_code_key" ON "PromoCode"("code") WHERE "venueId" IS NULL;
