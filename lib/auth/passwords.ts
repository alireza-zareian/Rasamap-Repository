import "server-only";
import bcrypt from "bcryptjs";

/** Every password hash and comparison in the app, so the cost is set once. */
const BCRYPT_ROUNDS = 12;

/**
 * Compared against when an account does not exist, so both cases cost the same
 * ~250 ms. It must be a real cost-12 hash: bcryptjs answers `false` at once for
 * a malformed one, which would undo the point. Its input was a discarded random string.
 */
const TIMING_PAD_HASH = "$2a$12$b49u2ltoc8xEG0Tzpj17q.eyApurHQ6u1FLPkQkLN4jiJknzE79yO";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** Compare with the stored hash, or the padding hash when the lookup found nothing — always pass what it found. */
export async function passwordMatches(password: string, storedHash: string | null | undefined): Promise<boolean> {
  const matched = await bcrypt.compare(password, storedHash ?? TIMING_PAD_HASH);
  return matched && storedHash != null;
}
