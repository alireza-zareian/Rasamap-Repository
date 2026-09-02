-- DB-level floor against a double-submitted listing.
--
-- Idempotency-Key already covers a client that sends one, but it is an opt-in
-- header: a double-click or a retry without it would create a second identical
-- row. This is the constraint the reservation table used to carry, moved to the
-- path that now does the non-idempotent write.
--
-- Partial index: it applies only to rows submitted through /list-media. Scraped
-- and admin-created rows legitimately repeat a name in a city, and Prisma
-- cannot express a WHERE clause on an index, so it lives here in raw SQL.
CREATE UNIQUE INDEX "listings_submitter_name_city_key"
    ON "billboards" ("submittedById", "name", "city")
    WHERE "source" = 'listing' AND "submittedById" IS NOT NULL;
