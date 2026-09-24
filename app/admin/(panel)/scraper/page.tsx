import { getAdminStats } from "@/lib/db/stats";
import { SectionCard } from "@/components/admin/Badge";
import { ScraperPanel } from "@/components/admin/ScraperPanel";

export default async function ScraperSection() {
  return <SectionCard><ScraperPanel stats={await getAdminStats()} /></SectionCard>;
}
