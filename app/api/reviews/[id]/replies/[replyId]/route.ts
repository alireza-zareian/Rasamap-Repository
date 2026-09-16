import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { rateLimited } from "@/lib/api-rate-limit";
import { getSession } from "@/lib/auth/session";
import { userApiRateLimit } from "@/lib/auth/rate-limit";
import { hasPermission } from "@/lib/auth/users";
import { prisma } from "@/lib/db/client";
import { withApiLog } from "@/lib/api-log";

/**
 * DELETE /api/reviews/[id]/replies/[replyId] — remove a reply.
 *
 * Two people may do it: whoever wrote it, and an editor or above. The second is
 * moderation, not a back door — a public thread that only its author can clean
 * up has no answer to an abusive reply, and the alternative (an admin editing
 * the database by hand) is worse in every way, including that it leaves no
 * audit trail.
 */
async function DELETEHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; replyId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  }

  const ip = getClientIp(req);
  const rl = userApiRateLimit(ip);
  if (!rl.allowed) return rateLimited(rl, { endpoint: "reviews/[id]/replies/[replyId]", ip });

  const { id: rawReview, replyId: raw } = await params;
  const reviewId = Number.parseInt(rawReview, 10);
  const replyId = Number.parseInt(raw, 10);
  if (Number.isNaN(replyId) || replyId <= 0 || Number.isNaN(reviewId) || reviewId <= 0) {
    return NextResponse.json({ error: "شناسه نامعتبر" }, { status: 400 });
  }

  // Matched on both ids, not on the reply alone. The review in the path used to
  // be decorative: DELETE /api/reviews/999999/replies/5 removed reply 5, which
  // belongs to another review entirely and under a review that does not exist.
  // Nothing could be reached that the checks below would not have allowed
  // anyway, so this was never a way in — but a route whose path means less than
  // it says is one a later reader will trust for more than it is worth.
  const reply = await prisma.reviewReply.findFirst({
    where:  { id: replyId, reviewId },
    select: { id: true, userId: true },
  });
  if (!reply) return NextResponse.json({ error: "پاسخ یافت نشد" }, { status: 404 });

  const isModerator = session.role !== "user" && hasPermission(session.role, "editor");
  const isAuthor = session.role === "user" && reply.userId === Number.parseInt(session.userId, 10);

  // A reply the caller may not touch is reported as missing, for the same
  // reason a review is: the difference tells a stranger which ids exist.
  if (!isAuthor && !isModerator) {
    return NextResponse.json({ error: "پاسخ یافت نشد" }, { status: 404 });
  }

  await prisma.reviewReply.delete({ where: { id: replyId } });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export const DELETE = withApiLog("reviews/[id]/replies/[replyId]", DELETEHandler);
