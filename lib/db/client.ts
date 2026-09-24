// ============================================================
// RASAMAP — Prisma client singleton
//
// One connection per process, in every mode.
//
// The guard was here for dev, where hot reload re-evaluates modules on every
// request and would open a new SQLite connection each time. It is needed in
// production too, for a different reason: Next splits server code into chunks,
// and a page rendered on the server and a route handler live in different ones,
// so the module is instantiated more than once and each copy opened its own
// connection to the same file.
//
// With WAL that is not merely wasteful, it is wrong. Two connections, one
// checkpointing the write-ahead log while the other is part-way through a read,
// produce SQLITE_IOERR_SHORT_READ — the page 500s while the API beside it is
// fine. It surfaced as a detail page failing under a test run that wrote and
// read hard at the same time, which is also what a demo with several people on
// it looks like.
//
// Prisma 7's generated client has no implicit query engine binary —
// a driver adapter must be passed explicitly, the same way
// prisma/seed.ts already does for the seed script.
// ============================================================

import "server-only";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { DB_ENGINE } from "./engine";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// journal_mode=WAL persists in the DB file header — set it once via a
// temporary connection so every subsequent connection (including Prisma's)
// automatically uses WAL mode without further configuration. PostgreSQL has
// its own write-ahead log and needs none of this.
if (!globalForPrisma.prisma && DB_ENGINE === "sqlite") {
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

/**
 * The driver for whichever engine DATABASE_URL names.
 *
 * The PostgreSQL adapter is required lazily rather than imported at the top:
 * on the SQLite path — which is every run today — the module is then never
 * loaded, and no connection pool is constructed for a database nobody asked
 * for. See lib/db/engine.ts and §27.
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
  // Built here rather than at module scope so re-importing the module does not
  // construct an adapter it will not use.
  return new PrismaClient({
    adapter: createAdapter(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

globalForPrisma.prisma = prisma;
