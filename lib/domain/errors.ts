/**
 * A rule of the application was broken, phrased for the person who broke it.
 *
 * The data layer (lib/db) raises these instead of building HTTP responses:
 * whether "review not found" ends as a 404 JSON body, a notFound() page or a
 * failed script is the caller's decision, not the query's. lib/http/route.ts is
 * the single place that maps a kind onto a status code, so the same refusal
 * cannot be a 404 in one route and a 400 in its neighbour.
 *
 * `message` is shown to the user as-is, so it is always Persian and never
 * carries an internal detail (AGENTS.md rule 4, audit §5).
 */
export type DomainErrorKind =
  | "invalid"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict";

export class DomainError extends Error {
  readonly kind: DomainErrorKind;

  constructor(kind: DomainErrorKind, message: string) {
    super(message);
    this.name = "DomainError";
    this.kind = kind;
  }
}

export const invalid   = (message: string) => new DomainError("invalid", message);
export const forbidden = (message: string) => new DomainError("forbidden", message);
export const notFound  = (message: string) => new DomainError("not_found", message);
export const conflict  = (message: string) => new DomainError("conflict", message);

/**
 * True when Prisma refused a write because a unique index already held the
 * value. The index — not a read before the write — is what decides a duplicate
 * (audit §8), so every get-or-create and every "already taken" answer ends here.
 */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}
