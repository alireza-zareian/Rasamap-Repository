import "server-only";
import { prisma } from "./client";

/** The smallest question the database can answer — it is polled every few seconds. */
export async function pingDatabase(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
