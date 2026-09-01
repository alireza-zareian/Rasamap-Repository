// ============================================================
// RASAMAP — Prisma client singleton
//
// Next.js dev mode hot-reloads modules on every request; without this
// guard each reload would create a brand-new PrismaClient and open a
// new SQLite connection, eventually exhausting file handles.
// Standard pattern from Prisma's own Next.js guide.
//
// Prisma 7's generated client has no implicit query engine binary —
// a driver adapter must be passed explicitly, the same way
// prisma/seed.ts already does for the seed script.
// ============================================================

import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// journal_mode=WAL persists in the DB file header — set it once via a
// temporary connection so every subsequent connection (including Prisma's)
// automatically uses WAL mode without further configuration.
if (!globalForPrisma.prisma) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const SQLite3 = require("better-sqlite3") as any;
    const dbPath = (process.env.DATABASE_URL ?? "file:./dev.db").replace(/^file:/, "");
    const initDb = new SQLite3(dbPath);
    initDb.pragma("journal_mode = WAL");
    initDb.close();
  } catch {
    // Non-fatal — WAL is a performance optimization, not a correctness requirement
  }
}

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL!,
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
