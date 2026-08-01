-- Card-number-based payment was never wired up (see 20260801010000_zone_card_number_default);
-- clean any leftover values before dropping the column.
UPDATE "Zone" SET "cardNumber" = '' WHERE "cardNumber" IS NOT NULL AND "cardNumber" <> '';
UPDATE "Ticket" SET "cardNumber" = '' WHERE "cardNumber" IS NOT NULL AND "cardNumber" <> '';

-- AlterTable
ALTER TABLE "Zone" DROP COLUMN "cardNumber";
ALTER TABLE "Ticket" DROP COLUMN "cardNumber";
