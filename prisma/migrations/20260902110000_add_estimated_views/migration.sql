-- Denormalise traffic.estimatedViews into its own indexed column.
--
-- Why: the catalogue offers a "بیشترین بازدید" sort, but estimatedViews lives
-- inside the `traffic` JSON column. SQLite can read it with json_extract(),
-- yet Prisma cannot express ORDER BY on a JSON path and no index can cover it,
-- so that sort silently fell back to `rating`. A plain integer column is
-- sortable, indexable, and cheap to keep in sync (traffic is only written by
-- the seed and by newly created rows).

ALTER TABLE "billboards" ADD COLUMN "estimatedViews" INTEGER NOT NULL DEFAULT 0;

-- Backfill from the JSON already stored on every row.
UPDATE "billboards"
   SET "estimatedViews" = COALESCE(CAST(json_extract("traffic", '$.estimatedViews') AS INTEGER), 0);

CREATE INDEX "billboards_hasImages_estimatedViews_idx"
    ON "billboards" ("hasImages", "estimatedViews");
