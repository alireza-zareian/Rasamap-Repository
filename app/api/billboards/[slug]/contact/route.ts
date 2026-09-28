import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { slugParams } from "@/lib/http/params";
import { contactRevealRateLimit, userApiRateLimit } from "@/lib/rate-limit";
import { getBillboardBySlug } from "@/lib/db/billboards";
import { recordLead } from "@/lib/db/leads";
import { notFound } from "@/lib/domain/errors";

/**
 * POST /api/billboards/[slug]/contact — give a signed-in account the owner's
 * phone and record the lead (§17, §23). POST, because asking is a deliberate
 * click that writes; a GET could be fired by a prefetch. The number is in no
 * public response (§20).
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

    // Staff checking a page is not demand.
    if (actor.kind === "customer") await recordLead(billboard.id, actor.id);

    return NextResponse.json(
      { phone, agency: billboard.agency ?? "" },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  },
);
