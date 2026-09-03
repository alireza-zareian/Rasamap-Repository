-- CreateTable
CREATE TABLE "contact_requests" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "billboardId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "note" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "lastRequestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "contact_requests_billboardId_fkey" FOREIGN KEY ("billboardId") REFERENCES "billboards" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contact_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "contact_requests_status_lastRequestedAt_idx" ON "contact_requests"("status", "lastRequestedAt");

-- CreateIndex
CREATE INDEX "contact_requests_billboardId_idx" ON "contact_requests"("billboardId");

-- CreateIndex
CREATE INDEX "contact_requests_userId_idx" ON "contact_requests"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_requests_billboardId_userId_key" ON "contact_requests"("billboardId", "userId");
