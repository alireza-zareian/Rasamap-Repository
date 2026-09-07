/**
 * Which database engine this process is talking to.
 *
 * One question, answered in one place, from one input: the connection string.
 * Nothing else in the codebase gets to decide — no second environment variable
 * that can disagree with `DATABASE_URL`, and nothing inferred from `NODE_ENV`
 * (rule 9 in AGENTS.md is about exactly that class of guess).
 *
 * The project runs on SQLite and is expected to keep doing so for the demo:
 * §14 of docs/engineering-decisions.md explains why a single file is the right
 * answer for one process on one laptop. This module exists so that the day the
 * answer changes, changing it is a connection string rather than a rewrite —
 * see §27 and `npm run db:to-postgres`.
 */

export type DbEngine = "sqlite" | "postgresql";

/**
 * Read the engine out of a connection string.
 *
 * `file:./dev.db`                        → sqlite
 * `postgresql://user:pass@host:5432/db`  → postgresql
 *
 * An unrecognised scheme is an error rather than a default. A typo that
 * silently picked SQLite would open an empty database file next to the app and
 * look like data loss.
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
