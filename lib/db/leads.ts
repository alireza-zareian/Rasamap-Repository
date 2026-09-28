import "server-only";
import { prisma } from "./client";
import { notFound, isUniqueViolation } from "@/lib/domain/errors";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/types";
import { logger } from "@/lib/logger";

/**
 * Leads: one ContactRequest per (media, customer) that asked for the owner's
 * number. The deal happens elsewhere (§17), so this is the only record of demand.
 */

const LEAD_FIELDS = {
  id: true, status: true, note: true, count: true,
  lastRequestedAt: true, createdAt: true,
  user:      { select: { id: true, name: true, phone: true } },
  billboard: { select: { id: true, name: true, slug: true, city: true, type: true, price: true, agency: true, phone: true } },
} as const;

/**
 * Get-or-create the lead for this pair; the unique index on (billboardId,
 * userId) defines a duplicate, and a repeat is an atomic `count` increment.
 * Logs rather than throws: bookkeeping must not cost the customer the number.
 */
export async function recordLead(billboardId: number, customerId: number): Promise<void> {
  const bump = { count: { increment: 1 }, lastRequestedAt: new Date() };
  const where = { billboardId_userId: { billboardId, userId: customerId } };
  try {
    await prisma.contactRequest.upsert({ where, update: bump, create: { billboardId, userId: customerId } });
  } catch (err) {
    // Two first clicks raced to insert: count this one against the other's row.
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

  // Every state starts at 0, so an empty one still shows in the filter.
  const counts: Record<string, number> = Object.fromEntries(LEAD_STATUSES.map(s => [s, 0]));
  for (const g of grouped) counts[g.status] = g._count._all;

  return { leads: rows, counts, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

/**
 * Set a lead's follow-up state and internal note (empty clears it). Only these
 * two: who asked for which number, and when, is a record staff annotate, never edit.
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
