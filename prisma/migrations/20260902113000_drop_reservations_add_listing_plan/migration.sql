-- Rasamap is a directory, not a booking engine: it does not own the media it
-- lists, so the online-reservation flow was removed and revenue moved to the
-- listing side. This migration drops the reservation table and adds the fields
-- the listing pipeline needs.

DROP INDEX IF EXISTS "reservations_billboardId_userId_startDate_endDate_key";
DROP INDEX IF EXISTS "reservations_billboardId_startDate_endDate_idx";
DROP TABLE IF EXISTS "reservations";

-- Who submitted this row through /list-media (null for scraped/admin rows).
ALTER TABLE "billboards" ADD COLUMN "submittedById" INTEGER REFERENCES "users"("id");
-- What the submitter asked for, and what an admin actually granted after
-- confirming payment. Kept apart so an unpaid request cannot promote a listing.
ALTER TABLE "billboards" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "billboards" ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "billboards_submittedById_idx" ON "billboards" ("submittedById");
CREATE INDEX "billboards_featured_hasImages_price_idx" ON "billboards" ("featured", "hasImages", "price");
