-- A crawled board's "available" meant "listed at the source", not "free":
-- none of the sources publish whether a board is let. Such rows become
-- `unknown` («استعلام از مالک»). Rows an admin created or a customer listed
-- (source 'manual' / 'listing'), and the curated set (source NULL), keep what
-- they say. SQLite stores the enum as TEXT, so the new value needs no DDL.
UPDATE "billboards"
SET "availability" = 'unknown'
WHERE "availability" = 'available'
  AND "source" IS NOT NULL
  AND "source" NOT IN ('manual', 'listing');
