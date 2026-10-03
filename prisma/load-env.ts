// Read the env files with Next.js's own loader, so a script sees each value
// exactly as the server does. With plain dotenv the two disagreed on "$": Next
// expands $NAME inside any value, and a bcrypt hash ($2b$12$<salt…>) reached the
// server cut short while the seed stored it whole. One parser, one reading.
// Imported first by every script here; prisma.config.ts does the same for the
// Prisma CLI. A variable already in the environment wins over the files.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });
