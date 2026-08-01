-- Sales are manat-only from now on; normalize any venue that isn't already.
UPDATE "Venue" SET "currency" = '₼' WHERE "currency" != '₼';
