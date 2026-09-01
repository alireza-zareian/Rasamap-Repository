-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "idempotency_keys_userId_idx" ON "idempotency_keys"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_billboardId_userId_startDate_endDate_key" ON "reservations"("billboardId", "userId", "startDate", "endDate");
