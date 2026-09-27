-- Sessions become rows (lib/db/sessions.ts). A signed-out token no longer needs
-- a revocation list, and signing an account out everywhere deletes its rows
-- instead of bumping a version every request compared against. Existing
-- signed tokens stop working: everyone signs in once more.


-- DropIndex
DROP INDEX "revoked_sessions_expiresAt_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "revoked_sessions";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "userId" INTEGER,
    "adminId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sessions_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_admins" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_admins" ("active", "createdAt", "email", "id", "name", "passwordHash", "role") SELECT "active", "createdAt", "email", "id", "name", "passwordHash", "role" FROM "admins";
DROP TABLE "admins";
ALTER TABLE "new_admins" RENAME TO "admins";
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");
CREATE TABLE "new_users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_users" ("createdAt", "id", "name", "passwordHash", "phone") SELECT "createdAt", "id", "name", "passwordHash", "phone" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_adminId_idx" ON "sessions"("adminId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

