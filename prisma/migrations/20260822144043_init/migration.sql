-- CreateTable
CREATE TABLE "owners" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "company" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "admins" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "billboards" (
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

-- CreateTable
CREATE TABLE "reservations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "billboardId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "reservations_billboardId_fkey" FOREIGN KEY ("billboardId") REFERENCES "billboards" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "reservations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "adminId" INTEGER,
    "userEmail" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "details" JSONB,
    CONSTRAINT "audit_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "billboards_slug_key" ON "billboards"("slug");

-- CreateIndex
CREATE INDEX "billboards_city_idx" ON "billboards"("city");

-- CreateIndex
CREATE INDEX "billboards_type_idx" ON "billboards"("type");

-- CreateIndex
CREATE INDEX "billboards_ownerId_idx" ON "billboards"("ownerId");

-- CreateIndex
CREATE INDEX "reservations_billboardId_startDate_endDate_idx" ON "reservations"("billboardId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "audit_logs_adminId_idx" ON "audit_logs"("adminId");
