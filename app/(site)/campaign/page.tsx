import type { Metadata } from "next";
import { getPublishedBillboardsBySlugs, toCatalogueItem } from "@/lib/db/billboards";
import { isCampaignPeriod, parseBudget, parsePickedSlugs } from "@/lib/domain/campaign";
import CampaignPlanner from "./CampaignPlanner";

export const metadata: Metadata = {
  title: "طرح کمپین | رسامپ",
  description: "چند رسانه را کنار هم بگذارید، دورهٔ اکران را انتخاب کنید و هزینه، بازدید و هزینهٔ هر هزار نمایش را یکجا ببینید.",
  // One visitor's plan, not a page for a search result.
  robots: { index: false, follow: false },
};

/**
 * A campaign: the media in `?m=`, priced for the period in `?p=` (§40),
 * against the budget in `?b=` when there is one (§42). The
 * address is the whole plan, so it is also the link that is shared, and the
 * page always renders today's prices rather than a browser's saved copy.
 */
export default async function CampaignPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const slugs = parsePickedSlugs(one(sp.m));
  const period = one(sp.p);
  const items = (await getPublishedBillboardsBySlugs(slugs)).map(toCatalogueItem);

  return (
    <CampaignPlanner
      items={items}
      period={isCampaignPeriod(period) ? period : "month"}
      requested={slugs}
      budget={parseBudget(one(sp.b))}
    />
  );
}
