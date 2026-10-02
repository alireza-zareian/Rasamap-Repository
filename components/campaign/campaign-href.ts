import type { CampaignPeriod } from "@/lib/domain/campaign";

/**
 * The address of a campaign: its media in `?m=`, the period in `?p=` when it
 * is not the monthly default, the budget in `?b=` when there is one. The
 * planner renders from it, and it is the link that is shared, so it carries
 * everything and nothing else.
 */
export function campaignHref(slugs: readonly string[], period: CampaignPeriod = "month", budget: number | null = null): string {
  const p = new URLSearchParams();
  if (slugs.length) p.set("m", slugs.join(","));
  if (period !== "month") p.set("p", period);
  if (budget !== null) p.set("b", String(budget));
  const qs = p.toString().replace(/%2C/g, ",");
  return qs ? `/campaign?${qs}` : "/campaign";
}
