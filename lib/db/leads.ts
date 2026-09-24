import "server-only";
import { prisma } from "./client";
import { notFound, isUniqueViolation } from "@/lib/domain/errors";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/types";
import { logger } from "@/lib/logger";

/**
 * Leads — one ContactRequest per (media, customer) that asked for the owner's
 * number. Rasamap does not process the deal (§17), so the reveal is the last
 * thing the platform can observe, and this table is the only record that
 * demand happened at all.
 */

const LEAD_FIELDS = {
  id: true, status: true, note: true, count: true,
  lastRequestedAt: true, createdAt: true,
  user:      { select: { id: true, name: true, phone: true } },
  billboard: { select: { id: true, name: true, slug: true, city: true, type: true, price: true, agency: true, phone: true } },
} as const;

/**
 * Get-or-create the lead for this (media, customer) pair.
 *
 * A second reveal by the same person is the same lead, so the unique index on
 * (billboardId, userId) is what defines a duplicate, and the repeat is kept as
 * an atomic `count` increment rather than a second row — `increment` is a
 * single UPDATE, so two simultaneous clicks cannot both read 1 and both write 2.
 *
 * A failure here must not cost the customer the phone number they asked for:
 * the lead is bookkeeping, the number is the product. So this logs and returns
 * instead of throwing — but it logs, it does not swallow.
 */
export async function recordLead(billboardId: number, customerId: number): Promise<void> {
  const bump = { count: { increment: 1 }, lastRequestedAt: new Date() };
  const where = { billboardId_userId: { billboardId, userId: customerId } };
  try {
    await prisma.contactRequest.upsert({ where, update: bump, create: { billboardId, userId: customerId } });
  } catch (err) {
    // Two first-ever clicks raced and both tried to insert. The row the other
    // one created is the right answer, so count this click against it.
    if (isUniqueViolation(err)) {
      try {
        await prisma.contactRequest.update({ where, data: bump });
        return;
      } catch (retryErr) {
        logger.error("contact lead retry failed", { billboardId, customerId, error: String(retryErr) });
        return;
      }
    }
    logger.error("contact lead write failed", {
      billboardId,
      customerId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** A page of leads, newest activity first, with the count in every state. */
export async function listLeads(filter: { status?: LeadStatus; page: number; limit: number }) {
  const { status, page, limit } = filter;
  const where = status ? { status } : {};

  const [rows, total, grouped] = await Promise.all([
    prisma.contactRequest.findMany({
      where,
      orderBy: { lastRequestedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: LEAD_FIELDS,
    }),
    prisma.contactRequest.count({ where }),
    prisma.contactRequest.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  // Seed every known state with 0 so the panel's filter never hides a state
  // just because nothing is in it yet.
  const counts: Record<string, number> = Object.fromEntries(LEAD_STATUSES.map(s => [s, 0]));
  for (const g of grouped) counts[g.status] = g._count._all;

  return { leads: rows, counts, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

/**
 * Move a lead through its follow-up states and keep an internal memo on it.
 * Only these two fields are writable: who asked for which number and when is a
 * record of something that happened — staff annotate it, never edit it.
 * An empty note clears the memo.
 */
export async function updateLead(id: number, patch: { status?: LeadStatus; note?: string }) {
  const existing = await prisma.contactRequest.findUnique({ where: { id }, select: { status: true, billboardId: true } });
  if (!existing) throw notFound("سرنخ یافت نشد");

  const lead = await prisma.contactRequest.update({
    where: { id },
    data: {
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.note !== undefined ? { note: patch.note === "" ? null : patch.note } : {}),
    },
    select: LEAD_FIELDS,
  });
  return { before: existing, lead };
}
