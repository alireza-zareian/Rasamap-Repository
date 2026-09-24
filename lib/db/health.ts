import "server-only";
import { prisma } from "./client";

/**
 * The smallest question the database can be asked. Not a count, not a table
 * read: this runs every few seconds for as long as the site is up.
 */
export async function pingDatabase(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
