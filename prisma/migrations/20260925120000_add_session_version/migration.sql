-- A counter per account that every session token carries. Raising it signs
-- out every session issued before, which a signed token cannot do on its own.
ALTER TABLE "users" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "admins" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
