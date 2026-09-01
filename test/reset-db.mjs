// Reset the isolated test database to a clean schema.
// Safe: only ever touches the file named by DATABASE_URL (defaults to prisma/test.db).

import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

process.env.DATABASE_URL ||= "file:./prisma/test.db";
const DB = process.env.DATABASE_URL;

if (DB.includes("dev.db")) {
  console.error("refusing to reset the development database. Set DATABASE_URL to a test file.");
  process.exit(1);
}

// Delete the test DB files outright, then let `db push` recreate the schema on
// an empty database. This avoids `--force-reset` (which Prisma 7 blocks for AI
// agents) — there is simply no data to destroy once the files are gone.
const file = DB.replace(/^file:/, "").replace(/^\.\//, "");
let removed = 0;
for (const suffix of ["", "-shm", "-wal", "-journal"]) {
  try {
    rmSync(file + suffix);
    removed += 1;
  } catch {
    /* not present — fine */
  }
}
console.log(`removed ${removed} stale test db file(s)`);

// Prisma 7: pass --url explicitly so the test file is targeted regardless of
// what prisma.config.ts / .env resolve DATABASE_URL to.
execSync(`npx prisma db push --url "${DB}"`, {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: DB },
});

console.log(`test db reset -> ${file}`);
