import IntentLink from "@/components/ui/IntentLink";
import { SearchX, Map as MapIcon } from "lucide-react";
import SnakeScroll from "@/components/SnakeScroll";
import { ButtonLink } from "@/components/ui/Button";
import { faNum } from "@/lib/format";
import { getCachedFilteredBillboards, getCachedShowcaseBillboards } from "@/lib/db/cached";
import { parseExploreParams, toFilterParams, exploreHref, PAGE_SIZE, type ExploreFilters } from "@/lib/explore-query";
import { ExploreControls, SortSelect } from "./ExploreControls";
import ExploreShowcase from "./ExploreShowcase";
import ExploreResults from "./ExploreResults";
import styles from "./explore.module.css";

/**
 * The catalogue — a Server Component. The Prisma query runs while the page is
 * built, so the catalogue is in the document a search engine reads, and repeat
 * visits to the same filter are served from the cache (lib/db/cached.ts).
 * /api/billboards is the same resource for anything that is not this page.
 */

/** Slides in the hero carousel — a dozen photos is a minute of auto-advance. */
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
  // A page past the end is reachable by hand or from a stale link, and must
  // not be answered with "nothing matched".
  const pastEnd = total > 0 && filters.page > totalPages;

  return (
    <main className={styles.page}>
      <SnakeScroll />
      <div className={styles.hero}>
        <ExploreControls filters={filters} total={total} />
        <ExploreShowcase items={showcase} />
      </div>

      <div className={styles.bar}>
        <div className={styles.barCount}>
          <strong>{faNum(total)}</strong> رسانه یافت شد
          {/* A visitor who arrived from a media page's "nearby" link and is not
              told the results are cut to a circle reads a short list as an
              empty catalogue. */}
          {filters.near && <span className={styles.barNear}> — در شعاع {faNum(filters.near.radiusKm)} کیلومتری</span>}
        </div>
        <div className={styles.barActions}>
          {/* The filters travel to the map, so switching view keeps the search. */}
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
                : "رسانه‌ای با این فیلترها یافت نشد"}
          </div>
          <ButtonLink href={pastEnd ? exploreHref({ ...filters, page: 1 }) : "/explore"} size="sm">
            {pastEnd ? "بازگشت به صفحهٔ اول" : "پاک کردن فیلترها"}
          </ButtonLink>
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

/**
 * The page numbers to show: the first, the last, and two either side of the
 * current one, with a gap marker where pages are skipped. With only
 * "previous / next" the 148 pages of the full catalogue were 147 clicks apart.
 */
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

/**
 * Real links rather than buttons, so every page of the catalogue has an address
 * a crawler can follow and a visitor can bookmark.
 */
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
