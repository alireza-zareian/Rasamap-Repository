import "server-only";
import bcrypt from "bcryptjs";

/**
 * Every password hash and comparison in the app. There used to be five call
 * sites spelling `bcrypt.hash(password, 12)` by hand; a cost changed in one of
 * them would have quietly left the others weaker.
 */
const BCRYPT_ROUNDS = 12;

/**
 * Constant-time padding hash.
 *
 * When the account does not exist there is no stored hash to compare against,
 * so the submitted password is compared with this one instead: both branches
 * then cost the same ~250 ms and the response time no longer reveals whether
 * the phone/email is registered.
 *
 * It MUST be a real bcrypt hash at the same cost as the stored ones. bcryptjs
 * accepts a malformed hash without throwing but returns `false` immediately —
 * a placeholder string therefore compares in ~0 ms and silently defeats the
 * whole defence. This is a cost-12 hash of a discarded random string; nothing
 * can match it.
 */
const TIMING_PAD_HASH = "$2a$12$b49u2ltoc8xEG0Tzpj17q.eyApurHQ6u1FLPkQkLN4jiJknzE79yO";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Compare a password with a stored hash — or, when there is no account, with
 * the padding hash, so "no such account" costs exactly what "wrong password"
 * does. Always pass what the lookup found, even if it found nothing.
 */
export async function passwordMatches(password: string, storedHash: string | null | undefined): Promise<boolean> {
  const matched = await bcrypt.compare(password, storedHash ?? TIMING_PAD_HASH);
  return matched && storedHash != null;
}
