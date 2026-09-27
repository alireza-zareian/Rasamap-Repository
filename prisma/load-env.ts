// The environment files the scripts in this folder read, in the order Next.js
// reads them: `.env.local` first, then `.env`. `import "dotenv/config"` reads
// `.env` alone, so on a machine set up from .env.example (which says
// `.env.local`) a seed ran against the fallback database and skipped the admin
// account. Imported first by every script here, before anything reads
// process.env. prisma.config.ts does the same for the Prisma CLI.
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
