import type { CampaignPeriod } from "@/lib/domain/campaign";

/**
 * The address of a campaign: its media in `?m=`, the period in `?p=` when it
 * is not the monthly default. The planner renders from it, and it is the link
 * that is shared, so it carries everything and nothing else.
 */
export function campaignHref(slugs: readonly string[], period: CampaignPeriod = "month"): string {
  const p = new URLSearchParams();
  if (slugs.length) p.set("m", slugs.join(","));
  if (period !== "month") p.set("p", period);
  const qs = p.toString().replace(/%2C/g, ",");
  return qs ? `/campaign?${qs}` : "/campaign";
}
