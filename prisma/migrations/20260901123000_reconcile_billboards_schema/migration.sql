-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_billboards" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "faces" INTEGER NOT NULL,
    "age" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "priceWeekly" INTEGER NOT NULL,
    "priceQuarterly" INTEGER NOT NULL,
    "priceYearly" INTEGER NOT NULL,
    "traffic" JSONB NOT NULL,
    "mapX" REAL NOT NULL,
    "mapY" REAL NOT NULL,
    "lat" REAL,
    "lng" REAL,
    "icon" TEXT NOT NULL,
    "hasImages" BOOLEAN NOT NULL DEFAULT false,
    "images" JSONB NOT NULL,
    "allImages" JSONB,
    "agency" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "features" JSONB NOT NULL,
    "nearbyLandmarks" JSONB NOT NULL,
    "rating" REAL NOT NULL,
    "reviewCount" INTEGER NOT NULL,
    "url" TEXT,
    "source" TEXT,
    "structureCode" TEXT,
    "scrapedAt" TEXT,
    "ownerId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "billboards_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_billboards" ("age", "agency", "allImages", "city", "createdAt", "description", "faces", "features", "height", "icon", "id", "images", "lat", "lng", "location", "mapX", "mapY", "name", "nearbyLandmarks", "ownerId", "phone", "price", "priceQuarterly", "priceWeekly", "priceYearly", "rating", "region", "reviewCount", "scrapedAt", "slug", "source", "status", "structureCode", "traffic", "type", "updatedAt", "url", "width") SELECT "age", "agency", "allImages", "city", "createdAt", "description", "faces", "features", "height", "icon", "id", "images", "lat", "lng", "location", "mapX", "mapY", "name", "nearbyLandmarks", "ownerId", "phone", "price", "priceQuarterly", "priceWeekly", "priceYearly", "rating", "region", "reviewCount", "scrapedAt", "slug", "source", "status", "structureCode", "traffic", "type", "updatedAt", "url", "width" FROM "billboards";
DROP TABLE "billboards";
ALTER TABLE "new_billboards" RENAME TO "billboards";
CREATE UNIQUE INDEX "billboards_slug_key" ON "billboards"("slug");
CREATE INDEX "billboards_city_idx" ON "billboards"("city");
CREATE INDEX "billboards_type_idx" ON "billboards"("type");
CREATE INDEX "billboards_status_idx" ON "billboards"("status");
CREATE INDEX "billboards_price_idx" ON "billboards"("price");
CREATE INDEX "billboards_ownerId_idx" ON "billboards"("ownerId");
CREATE INDEX "billboards_hasImages_idx" ON "billboards"("hasImages");
CREATE INDEX "billboards_hasImages_price_idx" ON "billboards"("hasImages", "price");
CREATE INDEX "billboards_city_status_idx" ON "billboards"("city", "status");
CREATE INDEX "billboards_city_type_idx" ON "billboards"("city", "type");
CREATE INDEX "billboards_type_price_idx" ON "billboards"("type", "price");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

