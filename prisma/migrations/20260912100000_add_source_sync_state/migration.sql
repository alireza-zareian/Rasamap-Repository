-- Sync state for the scheduled crawler import (prisma/sync-scraped.ts).
--
-- Hand-written rather than generated: Prisma's SQLite provider rebuilds the
-- whole billboards table for a column add, which would also have to recreate
-- the partial unique index it cannot see (see 20260902140000). Two ALTER TABLE
-- statements reach the same schema and touch nothing else.
--
-- sourceSnapshot — what the source feed last said about this row, as JSON. The
-- importer compares three values per field: the snapshot, the row now, and the
-- feed now. Row == snapshot means nobody has touched it and the feed may write;
-- row != snapshot means an admin edited it and the feed must not.
--
-- missingSince — when the row stopped appearing in the feed. Deleting it would
-- take its reviews and contact requests with it, so it is marked instead.
ALTER TABLE "billboards" ADD COLUMN "sourceSnapshot" JSONB;
ALTER TABLE "billboards" ADD COLUMN "missingSince" DATETIME;

