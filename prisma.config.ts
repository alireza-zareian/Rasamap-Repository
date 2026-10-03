import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";

// The same files Next.js reads, read by Next.js's own loader (see
// prisma/load-env.ts for why not dotenv). Reading only `.env` (dotenv's
// default) once meant a laptop set up from .env.example — which says
// `.env.local` — ran migrate and seed against the fallback database below, and
// the seed skipped the admin account without an error. A variable already in
// the environment still wins over the files.
loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });

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
