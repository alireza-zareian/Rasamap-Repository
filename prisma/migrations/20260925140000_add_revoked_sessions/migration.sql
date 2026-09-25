-- Session tokens signed out before their expiry. See the RevokedSession model.
CREATE TABLE "revoked_sessions" (
    "jti" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL
);
CREATE INDEX "revoked_sessions_expiresAt_idx" ON "revoked_sessions"("expiresAt");
