import "dotenv/config";
import { defineConfig } from "prisma/config";

// `env("DATABASE_URL")` from prisma/config throws when the var is unset, which
// breaks `postinstall: prisma generate` on a fresh clone (before .env exists).
// `prisma generate` doesn't need a real URL; migrate/studio/push do, and those
// are always run with DATABASE_URL set. Fall back to the local dev file.
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