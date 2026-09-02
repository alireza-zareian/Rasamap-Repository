-- Denormalise the advertising surface (width * height) into its own column.
--
-- Why: the catalogue's "بزرگترین سطح" sort ordered by `width` alone, which is
-- not area — a 14x4 board (56 m2) sorted above an 8x12 one (96 m2). Prisma
-- cannot ORDER BY an expression, so the product is materialised. Unlike
-- estimatedViews this one is mutable: updateBillboard() recomputes it whenever
-- width or height changes.

ALTER TABLE "billboards" ADD COLUMN "area" INTEGER NOT NULL DEFAULT 0;

UPDATE "billboards" SET "area" = "width" * "height";

CREATE INDEX "billboards_hasImages_area_idx" ON "billboards" ("hasImages", "area");
