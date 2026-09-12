-- A crawler row this database deliberately does not have.
--
-- The nightly import (prisma/sync-scraped.ts) adds anything the feed has and
-- the database does not. Without this table that rule would resurrect every
-- duplicate `db:dedupe` merged away and every scraped row an admin deleted,
-- one night after the decision was made — the same failure as overwriting an
-- admin's price, just spelled with rows instead of fields.
--
-- reason: dedupe | admin_delete | first_sync
CREATE TABLE "source_tombstones" (
    "slug" TEXT NOT NULL PRIMARY KEY,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
