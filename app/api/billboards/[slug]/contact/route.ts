import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { slugParams } from "@/lib/http/params";
import { contactRevealRateLimit, userApiRateLimit } from "@/lib/rate-limit";
import { getBillboardBySlug } from "@/lib/db/billboards";
import { recordLead } from "@/lib/db/leads";
import { notFound } from "@/lib/domain/errors";

/**
 * POST /api/billboards/[slug]/contact — hand the owner's phone number to a
 * signed-in account, and record that it happened.
 *
 * POST rather than GET on purpose. The number is the end of Rasamap's part in
 * the transaction (there is no booking — §17 of docs/engineering-decisions.md),
 * so the reveal is the last observable signal of demand and the only thing the
 * lead table can be built from. A GET would be fired by every page render and
 * would record interest nobody expressed; asking for the number is an explicit
 * click, and an explicit click is a write.
 *
 * The number is kept out of every public response so it cannot be scraped
 * anonymously (§20).
 */
export const POST = defineRoute(
  {
    name: "billboards/[slug]/contact",
    access: "signed-in",
    rateLimit: userApiRateLimit,
    params: slugParams,
    messages: { signedOut: "برای دیدن اطلاعات تماس باید وارد حساب کاربری شوید" },
  },
  async ({ actor, params, tooMany }) => {
    const perAccount = await contactRevealRateLimit(`${actor.kind}:${actor.id}`);
    if (!perAccount.allowed) return tooMany(perAccount);

    const billboard = await getBillboardBySlug(params.slug);
    if (!billboard) throw notFound("رسانه یافت نشد");
    const phone = billboard.phone && billboard.phone !== "—" ? billboard.phone.trim() : "";

    // Only a customer produces a lead: a staff member checking a page is not
    // demand.
    if (actor.kind === "customer") await recordLead(billboard.id, actor.id);

    return NextResponse.json(
      { phone, agency: billboard.agency ?? "" },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  },
);
