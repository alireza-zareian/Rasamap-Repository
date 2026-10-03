// The Prisma client: one per process, kept on globalThis.
//
// Not only for dev's hot reload: in production Next puts pages and route
// handlers in different chunks, each instantiating this module, and two SQLite
// connections under WAL gave SQLITE_IOERR_SHORT_READ when one checkpointed
// during the other's read — a media page 500ing under concurrent writes.
//
// Prisma 7 needs its driver adapter passed explicitly.

import "server-only";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { logger } from "@/lib/logger";
import { DB_ENGINE } from "./engine";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// WAL is stored in the database file, so setting it once on a throwaway
// connection makes Prisma's connection use it too. PostgreSQL needs none of this.
if (!globalForPrisma.prisma && DB_ENGINE === "sqlite") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const SQLite3 = require("better-sqlite3") as any;
    // Set: ./engine.ts throws on import when it is not.
    const dbPath = process.env.DATABASE_URL!.replace(/^file:/, "");
    const initDb = new SQLite3(dbPath);
    initDb.pragma("journal_mode = WAL");
    initDb.close();
  } catch (err) {
    // Non-fatal: without WAL, reads wait on writes but stay correct. Logged,
    // so reads that slow down under writes have a cause someone can find.
    logger.warn("sqlite: could not switch to WAL", { error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * The driver for the engine DATABASE_URL names (./engine.ts, §27). The
 * PostgreSQL adapter is required lazily, so the SQLite path never loads it.
 */
function createAdapter() {
  if (DB_ENGINE === "postgresql") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaPg } = require("@prisma/adapter-pg");
    return new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  }
  return new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });
}

function createClient(): PrismaClient {
  return new PrismaClient({
    adapter: createAdapter(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

globalForPrisma.prisma = prisma;
