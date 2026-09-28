import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { slugParams } from "@/lib/http/params";
import { accountWriteRateLimit, userApiRateLimit } from "@/lib/rate-limit";
import { addFavorite, removeFavorite } from "@/lib/db/favorites";

/**
 * PUT and DELETE /api/favorites/[slug] — save and unsave one media item (§40).
 * Both are idempotent, which is why they are PUT and DELETE rather than a
 * toggle: a repeated or reordered tap cannot flip the state the wrong way.
 */
const spec = {
  name: "favorites/[slug]",
  access: "customer",
  rateLimit: userApiRateLimit,
  params: slugParams,
  messages: { signedOut: "برای ذخیرهٔ رسانه باید وارد حساب کاربری شوید" },
} as const;

export const PUT = defineRoute(spec, async ({ actor, params, tooMany }) => {
  const perAccount = await accountWriteRateLimit("favorite", String(actor.id));
  if (!perAccount.allowed) return tooMany(perAccount);
  await addFavorite(actor, params.slug);
  return NextResponse.json({ saved: true });
});

export const DELETE = defineRoute(spec, async ({ actor, params, tooMany }) => {
  const perAccount = await accountWriteRateLimit("favorite", String(actor.id));
  if (!perAccount.allowed) return tooMany(perAccount);
  await removeFavorite(actor, params.slug);
  return NextResponse.json({ saved: false });
});
