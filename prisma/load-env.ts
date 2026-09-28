// Read `.env.local`, then `.env`, as Next.js does — `dotenv/config` reads
// `.env` alone, and .env.example says `.env.local`. Imported first by every
// script here; prisma.config.ts does the same for the Prisma CLI.
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
