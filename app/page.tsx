import { getCachedSiteStats, getCachedShowcaseBillboards } from "@/lib/db/cached";
import LandingClient from "./LandingClient";

/**
 * The landing page — a Server Component since V1.
 *
 * The four headline statistics and the featured gallery used to be fetched by
 * the browser on mount, from /api/stats and /api/billboards, so the first
 * document served said "۳۵۰۰+" as a hardcoded guess and showed four grey
 * skeleton cards. Both reads now happen while the page is built, from the same
 * cached queries the catalogue uses, and the real numbers and media are in the
 * HTML.
 */

/** Cards in the featured gallery. The strip repeats its first four to loop. */
const GALLERY_CARDS = 12;

export default async function LandingPage() {
  const [stats, billboards] = await Promise.all([
    getCachedSiteStats(),
    getCachedShowcaseBillboards(GALLERY_CARDS),
  ]);

  return <LandingClient stats={stats} billboards={billboards} />;
}
