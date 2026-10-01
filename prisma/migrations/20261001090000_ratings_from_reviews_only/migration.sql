-- Every crawled and curated row arrived with an invented rating and review
-- count (the crawler drew them from a random generator), shown on the cards and
-- sent to search engines as structured data. From here on the reviews table is
-- the only source: each row's summary is recomputed from the reviews it really
-- has, rounded like lib/domain/rating.ts, and a row nobody reviewed is unrated.
-- Real reviews are untouched; only the denormalised summary changes.
UPDATE "billboards" SET
  "reviewCount" = (SELECT COUNT(*) FROM "reviews" r WHERE r."billboardId" = "billboards"."id"),
  "rating" = COALESCE((SELECT ROUND(AVG(r."rating"), 1) FROM "reviews" r WHERE r."billboardId" = "billboards"."id"), 0);
