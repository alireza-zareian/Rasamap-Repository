import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";

/**
 * Opt-in Idempotency-Key support for non-idempotent POSTs.
 *
 * - No header  → `{ replay: null, save: null }`; the route runs normally.
 * - Header, unseen → `{ replay: null, save }`; the route runs, then calls
 *   `save(status, body)` to record the outcome.
 * - Header, seen for this same user + endpoint → `{ replay: { status, body } }`;
 *   the route returns that instead of doing the work again.
 * - Header, seen for a different user or endpoint → `{ error }` (409).
 *
 * The key is stored only on a successful, side-effecting response so a failed
 * attempt can be retried.
 */

const KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;

type Result =
  | { error: string }
  | {
      replay: { status: number; body: unknown } | null;
      save: ((status: number, body: unknown) => Promise<void>) | null;
    };

export async function idempotency(
  req: NextRequest,
  userId: number,
  endpoint: string,
): Promise<Result> {
  const raw = req.headers.get("idempotency-key");
  if (!raw) return { replay: null, save: null };
  if (!KEY_RE.test(raw)) {
    return { error: "Idempotency-Key نامعتبر است (۸ تا ۱۲۸ نویسه: حروف، عدد، خط تیره)" };
  }

  const existing = await prisma.idempotencyKey.findUnique({ where: { key: raw } });
  if (existing) {
    if (existing.userId !== userId || existing.endpoint !== endpoint) {
      return { error: "این Idempotency-Key قبلاً برای درخواست دیگری استفاده شده است" };
    }
    return { replay: { status: existing.statusCode, body: existing.response }, save: null };
  }

  const save = async (status: number, body: unknown) => {
    try {
      await prisma.idempotencyKey.create({
        data: { key: raw, userId, endpoint, statusCode: status, response: body as object },
      });
    } catch {
      // A concurrent request with the same key won the create — nothing to do.
    }
  };
  return { replay: null, save };
}
