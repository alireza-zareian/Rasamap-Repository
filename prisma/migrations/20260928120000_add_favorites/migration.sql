-- A customer's saved media (lib/db/favorites.ts, §40). Additive: one new table.
-- CreateTable
CREATE TABLE "favorites" (
    "userId" INTEGER NOT NULL,
    "billboardId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "billboardId"),
    CONSTRAINT "favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "favorites_billboardId_fkey" FOREIGN KEY ("billboardId") REFERENCES "billboards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "favorites_billboardId_idx" ON "favorites"("billboardId");

