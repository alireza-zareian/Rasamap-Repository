import { LayoutGrid, Map as MapIcon } from "lucide-react";
import IranMap from "@/components/map/IranMap";
import { faNum } from "@/lib/format";
import { getCachedFilteredBillboards, getCachedMapPins, getCachedSiteStats } from "@/lib/db/cached";
import { parseExploreParams, toFilterParams, exploreHref } from "@/lib/explore-query";
import { countByProvince, isPlottable } from "@/lib/geo/distance";
import { ButtonLink } from "@/components/ui/Button";
import styles from "./map.module.css";

/**
 * The catalogue as a map, over the list's cached queries and URL filters. No
 * map provider (§32): the outline is vendored and the projection arithmetic.
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

  // Pins only once a province is chosen; at country level the shading carries the count.
  const [stats, { total }, rawPins] = await Promise.all([
    getCachedSiteStats(),
    getCachedFilteredBillboards(params),
    zoomed ? getCachedMapPins(params) : Promise.resolve([]),
  ]);

  const pins = rawPins.filter((p) => isPlottable(p.city, p.lat, p.lng));
  const provinceCounts = countByProvince(stats.byCity);

  const listHref = exploreHref(filters);

  return (
    <main id="main" className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>
          <MapIcon size={20} />
          {zoomed ? `رسانه‌های ${filters.province}` : "نقشهٔ رسانه‌ها"}
        </h1>
        <ButtonLink href={listHref} size="sm"><LayoutGrid size={14} /> نمای فهرستی</ButtonLink>
      </div>

      <p className={styles.lede}>
        {zoomed
          ? <>هر نقطه یک رسانه است؛ روی آن بزنید تا صفحه‌اش باز شود. برای بازگشت به کل کشور، دکمهٔ بالای نقشه.</>
          : <>هرچه استانی پررنگ‌تر باشد، رسانهٔ بیشتری در آن ثبت شده است. روی هر استان بزنید تا نقطه‌به‌نقطه ببینیدش.</>}
      </p>

      <div className={styles.frame}>
        <IranMap
          provinceCounts={provinceCounts}
          pins={pins}
          unplottable={Math.max(0, total - pins.length)}
          filters={filters}
        />
      </div>

      <div className={styles.foot}>
        <div>
          {/* A Persian zero is a dot, as on the results page. */}
          {total > 0 ? <><strong>{faNum(total)}</strong> رسانه در این محدوده</> : "رسانه‌ای در این محدوده نیست"}
          {zoomed && <> · <strong className={styles.onMap}>{faNum(pins.length)}</strong> روی نقشه</>}
        </div>
        {/* Required by geoBoundaries' CC BY 4.0 licence. */}
        <div className={styles.credit}>مرزها: geoBoundaries (CC BY 4.0)</div>
      </div>
    </main>
  );
}
