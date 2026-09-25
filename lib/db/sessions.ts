import "server-only";
import { prisma } from "./client";

/**
 * Signed-out session tokens (the `revoked_sessions` table). A JWT cannot be
 * recalled once issued, so signing out writes its id here and resolveActor
 * refuses any token found in the list.
 */

/** Record that this token was signed out. Signing out twice is not an error. */
export async function revokeSession(jti: string, expiresAt: Date): Promise<void> {
  await prisma.revokedSession.upsert({ where: { jti }, update: {}, create: { jti, expiresAt } });
  // Past its expiry a token is refused by its signature check anyway, so the
  // row has nothing left to do.
  await prisma.revokedSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

export async function isSessionRevoked(jti: string): Promise<boolean> {
  return (await prisma.revokedSession.count({ where: { jti } })) > 0;
}
