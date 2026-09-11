import Link from "next/link";
import { LayoutGrid, Map as MapIcon } from "lucide-react";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import IranMap from "@/components/IranMap";
import { faNum } from "@/lib/format";
import { getCachedFilteredBillboards, getCachedMapPins, getCachedSiteStats } from "@/lib/db/cached";
import { parseExploreParams, toFilterParams, exploreHref } from "@/lib/explore-query";
import { countByProvince, isPlottable } from "@/lib/geo";

/**
 * The catalogue as a map.
 *
 * A Server Component over the same cached queries the list uses, so switching
 * between the two views costs no database work — and the filters travel in the
 * URL, so a filtered map is a real address exactly as a filtered list is.
 *
 * Nothing here reaches a map provider. The reasoning is in §32: every hosted
 * map that could draw this is billed, keyed, or unreachable from an Iranian
 * connection, and usually all three. The outline is vendored, the projection is
 * arithmetic, and the only geography that leaves the server is the coordinates
 * of the rows being shown.
 */
export const metadata = {
  title: "نقشهٔ رسانه‌ها | رسامپ",
  description: "پراکندگی رسانه‌های تبلیغاتی محیطی روی نقشهٔ ایران، استان به استان.",
};

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseExploreParams(await searchParams);
  const params = toFilterParams(filters);
  const zoomed = Boolean(filters.province);

  // Pins are fetched only once a province is in view. At country level they
  // would be three thousand dots inside shapes that already carry the number,
  // which is slower to send and harder to read.
  const [stats, { total }, rawPins] = await Promise.all([
    getCachedSiteStats(),
    getCachedFilteredBillboards(params),
    zoomed ? getCachedMapPins(params) : Promise.resolve([]),
  ]);

  const pins = rawPins.filter((p) => isPlottable(p.city, p.lat, p.lng));
  const provinceCounts = countByProvince(stats.byCity);

  const listHref = exploreHref(filters);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-deep)" }}>
      <Topbar />

      <main style={{ paddingTop: 62, flex: 1 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 20px 40px" }}>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0, display: "flex", alignItems: "center", gap: 9 }}>
              <MapIcon size={20} color="var(--accent)" />
              {zoomed ? `رسانه‌های ${filters.province}` : "نقشهٔ رسانه‌ها"}
            </h1>
            <Link href={listHref} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "var(--bg-card)", border: "1px solid var(--border)",
              color: "var(--text-main)", textDecoration: "none",
              fontSize: "0.8rem", borderRadius: 9, padding: "8px 14px",
            }}>
              <LayoutGrid size={14} /> نمای فهرستی
            </Link>
          </div>

          <p style={{ fontSize: "0.83rem", color: "var(--text-muted)", lineHeight: 1.9, margin: "0 0 18px", maxWidth: "72ch" }}>
            {zoomed
              ? <>هر نقطه یک رسانه است؛ روی آن بزنید تا صفحه‌اش باز شود. برای بازگشت به کل کشور، دکمهٔ بالای نقشه.</>
              : <>هرچه استانی پررنگ‌تر باشد، رسانهٔ بیشتری در آن ثبت شده است. روی هر استان بزنید تا نقطه‌به‌نقطه ببینیدش.</>}
          </p>

          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: 16 }}>
            <IranMap
              provinceCounts={provinceCounts}
              pins={pins}
              unplottable={Math.max(0, total - pins.length)}
              filters={filters}
            />
          </div>

          <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              <span style={{ color: "var(--accent)", fontWeight: 700 }}>{faNum(total)}</span> رسانه در این محدوده
              {zoomed && <> · <span style={{ color: "var(--accent-warm)", fontWeight: 700 }}>{faNum(pins.length)}</span> روی نقشه</>}
            </div>
            {/* geoBoundaries is CC BY 4.0, so the credit is a licence term, not
                a courtesy — and it is the only outside thing this page uses. */}
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
              مرزها: geoBoundaries (CC BY 4.0)
            </div>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
