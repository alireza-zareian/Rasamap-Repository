/**
 * A broken rule, phrased for the person who broke it. The data layer raises
 * these instead of building responses; lib/http/route.ts alone maps a kind to a
 * status. `message` is shown as is: Persian, no internals (rule 4).
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

/** Prisma refused a write on a unique index — the index, not a prior read, decides a duplicate. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}
