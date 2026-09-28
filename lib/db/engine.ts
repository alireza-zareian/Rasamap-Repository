/**
 * The database engine, read from DATABASE_URL and nothing else. SQLite today
 * (§14); PostgreSQL is a connection string away (§27, `npm run db:to-postgres`).
 */

export type DbEngine = "sqlite" | "postgresql";

/**
 * `file:…` → sqlite, `postgres(ql)://…` → postgresql. Anything else throws: a
 * typo that defaulted to SQLite would open an empty file and look like data loss.
 */
export function dbEngineOf(url: string | undefined): DbEngine {
  if (!url) throw new Error("DATABASE_URL is not set");
  if (url.startsWith("file:")) return "sqlite";
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) return "postgresql";
  throw new Error(
    `DATABASE_URL has an unrecognised scheme: ${url.slice(0, 12)}… ` +
      `Expected file: (SQLite) or postgresql: (PostgreSQL).`,
  );
}

/** The engine this process is using. */
export const DB_ENGINE: DbEngine = dbEngineOf(process.env.DATABASE_URL);

export const isPostgres = () => DB_ENGINE === "postgresql";
