#!/usr/bin/env node
// Move the database from SQLite to PostgreSQL, and back (§27).
//
//   npm run db:to-postgres -- postgresql://user:pass@host:5432/rasamap
//   npm run db:to-postgres -- --dry-run postgresql://…    read and plan only
//   npm run db:to-sqlite                                   switch back
//
//   1. read every table out of SQLite into a temporary dump
//   2. point prisma/schema.prisma at postgresql, create the tables, regenerate
//   3. (child) copy every table, parents before children, in batches
//   4. (child) move each id sequence past the highest copied id — ids were
//      copied, and a sequence left at 1 collides on the next insert
//   5. (child) count both sides; fail unless every table matches
//
// Two processes, because a Prisma client already imported stays bound to its
// provider after regeneration. Any failure puts the schema back on sqlite;
// the SQLite database is only read. `prisma db push` asks an AI agent for
// consent through PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
const DUMP = join(tmpdir(), "rasamap-migration.json");

/**
 * Copy order: a row is written only after whatever it points at exists.
 * Every model in schema.prisma is here — one left out would be silently
 * skipped, so the verification at the end checks this list, not the schema.
 */
const TABLES = [
  // no foreign keys of their own
  "user",
  "admin",
  "sourceTombstone",
  // points at user
  "billboard",
  // point at billboard (and user)
  "billboardSource",
  "review",
  "contactRequest",
  // points at review, user and admin
  "reviewReply",
  // independent bookkeeping (auditLog points at user and admin)
  "otpCode",
  "auditLog",
  "idempotencyKey",
  // points at user and admin
  "session",
];

/** Prisma's @@map names — what the tables are actually called in PostgreSQL. */
const TABLE_NAMES = {
  user: "users",
  admin: "admins",
  sourceTombstone: "source_tombstones",
  billboard: "billboards",
  billboardSource: "billboard_sources",
  review: "reviews",
  contactRequest: "contact_requests",
  reviewReply: "review_replies",
  otpCode: "otp_codes",
  auditLog: "audit_logs",
  idempotencyKey: "idempotency_keys",
  session: "sessions",
};

/** Rows per insert — quick, and well under PostgreSQL's parameter ceiling. */
const BATCH = 500;

/**
 * What migrations hold and schema.prisma cannot, so `db push` would skip: the
 * partial unique index under double-submitted listings (§8), and searchText.
 * A new migration of this kind must be added here too.
 */
const EXTRA_INDEXES = [
  `CREATE UNIQUE INDEX IF NOT EXISTS "listings_submitter_name_city_key"
     ON "billboards" ("submittedById", "name", "city")
     WHERE "source" = 'listing' AND "submittedById" IS NOT NULL`,
  // searchText is filled by SQLite triggers; PostgreSQL generates it instead.
  // The same fold as SEARCH_FOLD in lib/domain/search.ts, through translate():
  // the trailing tatweel has no counterpart, so it is deleted. Change both.
  `ALTER TABLE "billboards" DROP COLUMN IF EXISTS "searchText"`,
  `ALTER TABLE "billboards" ADD COLUMN "searchText" text GENERATED ALWAYS AS (lower(translate(
     "name" || ' ' || "city" || ' ' || "location" || ' ' || "agency",
     'يىكةۀ\u200c۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩ـ',
     'ییکهه 01234567890123456789'))) STORED`,
];

const args = process.argv.slice(2);

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function setProvider(provider) {
  const text = readFileSync(SCHEMA, "utf8");
  const next = text.replace(
    /(datasource\s+db\s*\{[^}]*provider\s*=\s*)"[^"]+"/,
    `$1"${provider}"`,
  );
  if (next === text && !text.includes(`provider = "${provider}"`)) {
    fail(`could not find the datasource provider line in ${SCHEMA}`);
  }
  writeFileSync(SCHEMA, next);
}

const run = (cmd, cmdArgs) =>
  execFileSync(cmd, cmdArgs, { cwd: ROOT, stdio: "inherit" });

// ══ child: everything that touches PostgreSQL ═══════════════════════════════
if (args[0] === "--write-phase") {
  const target = args[1];
  const dump = JSON.parse(readFileSync(DUMP, "utf8"));

  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const pg = new PrismaClient({ adapter: new PrismaPg({ connectionString: target }) });

  console.log("\n▸ adding the indexes the schema file cannot express");
  for (const sql of EXTRA_INDEXES) {
    await pg.$executeRawUnsafe(sql);
    console.log(`  ${sql.trim().split("\n")[0].replace(/CREATE UNIQUE INDEX IF NOT EXISTS /, "")}`);
  }

  console.log("\n▸ copying");
  for (const table of TABLES) {
    // PostgreSQL generates searchText itself, and writing a generated column is an error.
    const rows = table === "billboard" ? dump[table].map(row => { const copy = { ...row }; delete copy.searchText; return copy; }) : dump[table];
    if (!rows.length) { console.log(`  ${table.padEnd(16)} empty`); continue; }
    for (let i = 0; i < rows.length; i += BATCH) {
      await pg[table].createMany({ data: rows.slice(i, i + BATCH), skipDuplicates: true });
    }
    console.log(`  ${table.padEnd(16)} ${rows.length}`);
  }

  // Read the note at the top of this file before deleting this loop.
  console.log("\n▸ advancing id sequences past the copied rows");
  for (const table of TABLES) {
    const rows = dump[table];
    if (!rows.length || typeof rows[0].id !== "number") continue;
    const highest = Math.max(...rows.map((r) => r.id));
    try {
      await pg.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('${TABLE_NAMES[table]}', 'id'), ${highest})`,
      );
      console.log(`  ${table.padEnd(16)} next id > ${highest}`);
    } catch {
      // A table whose ids are supplied rather than generated — Billboard, whose
      // ids come from the seed — has no sequence to advance.
      console.log(`  ${table.padEnd(16)} ids are supplied, not generated`);
    }
  }

  console.log("\n▸ verifying");
  let mismatch = 0;
  for (const table of TABLES) {
    const before = dump[table].length;
    const after = await pg[table].count();
    if (before !== after) mismatch++;
    console.log(`  ${before === after ? "✓" : "✗"} ${table.padEnd(16)} ${before} → ${after}`);
  }

  // A count that matches proves the rows arrived, not that the constraints
  // came with them — and the constraint that is easiest to lose is the one
  // that is not in the schema file.
  const [{ count: indexes }] = await pg.$queryRawUnsafe(
    `SELECT count(*)::int AS count FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'listings_submitter_name_city_key'`,
  );
  const indexOk = indexes === 1;
  console.log(`  ${indexOk ? "✓" : "✗"} partial unique index on submitted listings`);
  await pg.$disconnect();

  if (mismatch || !indexOk) {
    fail(mismatch ? `${mismatch} table(s) do not match.` : "the partial unique index is missing.");
  }
  console.log("");
  process.exit(0);
}

// ══ switching back ══════════════════════════════════════════════════════════
if (args.includes("--to-sqlite")) {
  setProvider("sqlite");
  run("npx", ["prisma", "generate"]);
  console.log(
    "\n✓ schema and client are back on SQLite." +
      "\n  Put the file: URL back in .env.local and rebuild.\n",
  );
  process.exit(0);
}

// ══ parent ══════════════════════════════════════════════════════════════════
const dryRun = args.includes("--dry-run");
const target = args.find((a) => a.startsWith("postgres"));

if (!target) {
  fail(
    "no target given.\n" +
      "  npm run db:to-postgres -- postgresql://user:pass@host:5432/rasamap\n" +
      "  npm run db:to-sqlite                (switch the schema back)",
  );
}

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl?.startsWith("file:")) {
  fail(`DATABASE_URL is not a SQLite file: URL (found ${sourceUrl?.slice(0, 20) ?? "nothing"}).`);
}

console.log(`\nSQLite  ${sourceUrl}\n     →  ${target.replace(/:\/\/[^@]*@/, "://***@")}\n`);

// ── 1. read, before anything is changed ─────────────────────────────────────
const { PrismaClient } = await import("@prisma/client");
const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");
const sqlite = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: sourceUrl }) });

const dump = {};
for (const table of TABLES) {
  dump[table] = await sqlite[table].findMany();
  console.log(`  read ${String(dump[table].length).padStart(6)}  ${table}`);
}
await sqlite.$disconnect();

const totalRows = Object.values(dump).reduce((n, rows) => n + rows.length, 0);
console.log(`\n  ${totalRows} rows to move\n`);

if (dryRun) {
  console.log("--dry-run: nothing was written, and the schema was not touched.\n");
  process.exit(0);
}

writeFileSync(DUMP, JSON.stringify(dump));

// ── 2. point the schema at the target and create the tables ─────────────────
try {
  console.log("▸ pointing the schema at postgresql and creating tables");
  setProvider("postgresql");
  // --url rather than DATABASE_URL: prisma.config.ts resolves the datasource
  // itself, so the environment alone would not redirect the push.
  run("npx", ["prisma", "db", "push", "--accept-data-loss", "--url", target]);
  run("npx", ["prisma", "generate"]);

  // ── 3–5. copy, fix sequences, verify — in a process that starts after the
  // client was regenerated, which is the whole reason this is split.
  run(process.execPath, [fileURLToPath(import.meta.url), "--write-phase", target]);
} catch (err) {
  setProvider("sqlite");
  run("npx", ["prisma", "generate"]);
  fail(
    "migration did not complete — the schema file and client are back on SQLite,\n" +
      `  and the SQLite database was never written to.\n  ${err.message}`,
  );
} finally {
  if (existsSync(DUMP)) unlinkSync(DUMP);
}

console.log(`✓ ${totalRows} rows moved, and counted on both sides.

  The schema and the generated client are now PostgreSQL, but the application
  still reads whatever DATABASE_URL says. To finish the switch:

    1. in .env.local
         DATABASE_URL="${target}"
    2. npm run build && npm test
    3. keep the SQLite file — it is the rollback (npm run db:to-sqlite)

  To stay on SQLite for now: npm run db:to-sqlite
`);
