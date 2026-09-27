import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// The same files Next.js reads, in the same order of precedence: `.env.local`
// first, then `.env`. Reading only `.env` (dotenv's default) meant a laptop set
// up from .env.example — which says `.env.local` — ran migrate and seed against
// the fallback database below, and the seed skipped the admin account without
// an error. A variable already in the environment still wins over both files.
config({ path: [".env.local", ".env"], quiet: true });

// `prisma generate` (postinstall, on a fresh clone) needs no real URL, so a
// missing DATABASE_URL falls back to the local file instead of throwing.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
});
