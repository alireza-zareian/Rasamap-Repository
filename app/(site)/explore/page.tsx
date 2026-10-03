import type { Metadata } from "next";
import IntentLink from "@/components/ui/IntentLink";
import { SearchX, Map as MapIcon } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { faNum } from "@/lib/format";
import { getCachedFilteredBillboards, getCachedShowcaseBillboards, getCachedSiteStats } from "@/lib/db/cached";
import { parseExploreParams, toFilterParams, exploreHref, exploreSeo, hasActiveFilters, PAGE_SIZE, type ExploreFilters } from "@/lib/explore-query";
import { ExploreControls, SortSelect } from "./ExploreControls";
import ExploreShowcase from "./ExploreShowcase";
import ExploreResults from "./ExploreResults";
import styles from "./explore.module.css";

/**
 * A title per type and place, one canonical address per view, and no index for
 * a one-off query (exploreSeo). The counts come from the catalogue: the
 * hand-written «۲۸۰۰ … ۸۷ شهر» they replace had drifted to 3545 in 100.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const seo = exploreSeo(parseExploreParams(await searchParams));
  const { total, cityCount } = await getCachedSiteStats();
  return {
    title: `${seo.title} | رسامپ`,
    description: `جستجو و فیلتر ${faNum(total)} بیلبورد، تلویزیون شهری، عرشه پل و ایستگاه در ${faNum(cityCount)} شهر ایران.`,
    alternates: { canonical: seo.canonical },
    ...(seo.indexable ? {} : { robots: { index: false, follow: true } }),
  };
}

/**
 * The catalogue, a Server Component: the results are in the HTML a search
 * engine reads, and repeat filters come from the cache (lib/db/cached.ts).
 */

/** Slides in the hero carousel. */
const SHOWCASE_SLIDES = 12;

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseExploreParams(await searchParams);

  const [{ items, total }, showcase] = await Promise.all([
    getCachedFilteredBillboards(toFilterParams(filters)),
    getCachedShowcaseBillboards(SHOWCASE_SLIDES),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  // Past the end (a stale link) is not the same as "nothing matched".
  const pastEnd = total > 0 && filters.page > totalPages;
  // A query that found nothing inside a city or a type may still find
  // something everywhere: offer that before wiping the query too.
  const searchAlone = filters.search && hasActiveFilters({ ...filters, search: "" })
    ? exploreHref(parseExploreParams({ search: filters.search }))
    : null;

  return (
    <main id="main" className={styles.page}>
      <div className={styles.hero}>
        <ExploreControls filters={filters} heading={exploreSeo(filters).heading} />
        <ExploreShowcase items={showcase} />
      </div>

      <div className={styles.bar}>
        <div className={styles.barCount}>
          {/* «۰» is a dot in Persian type and read as a stray bullet. */}
          {total > 0 ? <><strong>{faNum(total)}</strong> رسانه یافت شد</> : "رسانه‌ای یافت نشد"}
          {/* Say the results are cut to a circle, or a short list reads as an empty catalogue. */}
          {filters.near && <span className={styles.barNear}> — در شعاع {faNum(filters.near.radiusKm)} کیلومتری</span>}
        </div>
        <div className={styles.barActions}>
          {/* The filters travel to the map view. */}
          <ButtonLink href={exploreHref(filters, "/explore/map")} size="sm"><MapIcon size={14} /> نمای نقشه</ButtonLink>
          <SortSelect filters={filters} />
        </div>
      </div>

      {items.length === 0 ? (
        <div className={styles.empty}>
          <SearchX size={44} strokeWidth={1.5} />
          <div className={styles.emptyTitle}>
            {pastEnd
              ? `این نتایج ${faNum(totalPages)} صفحه دارد — صفحهٔ ${faNum(filters.page)} وجود ندارد`
              : filters.near
                ? `رسانه‌ای در شعاع ${faNum(filters.near.radiusKm)} کیلومتری این نقطه یافت نشد`
                : filters.search
                  ? `برای «${filters.search}» رسانه‌ای یافت نشد`
                  : "رسانه‌ای با این فیلترها یافت نشد"}
          </div>
          {filters.search && !pastEnd && (
            <p className={styles.emptyHint}>املای کلمه را بررسی کنید یا کوتاه‌ترش کنید — مثلاً فقط نام خیابان یا محله.</p>
          )}
          <div className={styles.emptyActions}>
            {searchAlone && !pastEnd && (
              <ButtonLink href={searchAlone} intent="primary" size="sm">جستجوی «{filters.search}» در همهٔ شهرها و انواع</ButtonLink>
            )}
            <ButtonLink href={pastEnd ? exploreHref({ ...filters, page: 1 }) : "/explore"} size="sm">
              {pastEnd ? "بازگشت به صفحهٔ اول" : "پاک کردن فیلترها"}
            </ButtonLink>
          </div>
        </div>
      ) : (
        <>
          <ExploreResults items={items} view={filters.view} />
          {totalPages > 1 && <Pager filters={filters} totalPages={totalPages} />}
        </>
      )}
    </main>
  );
}

/** First, last, and two either side of the current page, with gaps marked. */
function pageWindow(current: number, last: number): (number | "gap")[] {
  const pages = new Set([1, last, current - 2, current - 1, current, current + 1, current + 2]);
  const sorted = [...pages].filter(p => p >= 1 && p <= last).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

/** Links, not buttons, so every page has an address to follow and bookmark. */
function Pager({ filters, totalPages }: { filters: ExploreFilters; totalPages: number }) {
  const link = (to: number, label: React.ReactNode, aria: string, disabled = false) =>
    disabled
      ? <span className={styles.pageLink} aria-disabled="true">{label}</span>
      : <IntentLink href={exploreHref({ ...filters, page: to })} scroll={false} className={styles.pageLink} aria-label={aria}>{label}</IntentLink>;

  return (
    <nav aria-label="صفحه‌بندی" className={styles.pager}>
      {link(filters.page - 1, "‹ قبلی", "صفحهٔ قبلی", filters.page <= 1)}
      {pageWindow(filters.page, totalPages).map((p, i) =>
        p === "gap"
          ? <span key={`gap-${i}`} className={styles.gap}>…</span>
          : p === filters.page
            ? <span key={p} className={styles.pageLink} aria-current="page">{faNum(p)}</span>
            : <IntentLink key={p} href={exploreHref({ ...filters, page: p })} scroll={false} className={styles.pageLink} aria-label={`صفحهٔ ${faNum(p)}`}>{faNum(p)}</IntentLink>,
      )}
      {link(filters.page + 1, "بعدی ›", "صفحهٔ بعدی", filters.page >= totalPages)}
    </nav>
  );
}
