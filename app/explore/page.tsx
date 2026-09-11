import Link from "next/link";
import { SearchX, Map as MapIcon } from "lucide-react";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import SnakeScroll from "@/components/SnakeScroll";
import { faNum } from "@/lib/format";
import { getCachedFilteredBillboards, getCachedShowcaseBillboards } from "@/lib/db/cached";
import { parseExploreParams, toFilterParams, exploreHref, PAGE_SIZE } from "@/lib/explore-query";
import { ExploreControls, SortSelect } from "./ExploreControls";
import ExploreShowcase from "./ExploreShowcase";
import ExploreResults from "./ExploreResults";

/**
 * The catalogue — a Server Component since V1.
 *
 * It used to render an empty shell and let the browser fetch /api/billboards on
 * mount, which meant the page a search engine (or anyone reading the HTML) saw
 * was a frame with no media in it: thirty-three kilobytes without a single
 * price. The same Prisma query now runs while the page is being built, so the
 * catalogue is in the document, and the visit costs one request instead of two.
 *
 * The query goes through getCachedFilteredBillboards, so repeat visits to the
 * same filter do not reach the database at all — see lib/db/cached.ts.
 *
 * /api/billboards is untouched and still public: it is the interface for
 * anything that is not this page.
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
  // A page number past the end is reachable by hand or by a crawler following a
  // stale link, and it produces an empty grid for a reason that has nothing to
  // do with the filters — so it must not be answered with "nothing matched".
  const pastEnd = total > 0 && filters.page > totalPages;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-deep)" }}>
      <SnakeScroll />
      <Topbar />

      <main style={{ paddingTop: 62, flex: 1, display: "flex", flexDirection: "column" }}>

        {/* ── Hero: search (right) + showcase (left) ──────────── */}
        <div className="explore-hero" style={{
          display: "grid",
          gridTemplateColumns: "1fr minmax(320px, 360px)",
          borderBottom: "1px solid var(--border)",
        }}>
          <ExploreControls filters={filters} total={total} />
          <ExploreShowcase items={showcase} />
        </div>

        {/* ── Results header ───────────────────────────────────── */}
        <div style={{
          padding: "10px 24px", display: "flex", alignItems: "center",
          justifyContent: "space-between", borderBottom: "1px solid var(--border)",
          background: "var(--bg-deep)", position: "sticky", top: 62, zIndex: 10,
        }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            <span style={{ color: "var(--accent)", fontWeight: 700 }}>{faNum(total)}</span> رسانه یافت شد
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* The map carries the filters across, so switching view keeps the
                search the visitor already built rather than resetting it. */}
            <Link
              href={exploreHref(filters, "/explore/map")}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "var(--bg-card)", border: "1px solid var(--border)",
                color: "var(--text-main)", textDecoration: "none",
                fontSize: "0.78rem", borderRadius: 8, padding: "7px 12px",
                whiteSpace: "nowrap",
              }}
            >
              <MapIcon size={14} /> نمای نقشه
            </Link>
            <SortSelect filters={filters} />
          </div>
        </div>

        {/* ── Results ──────────────────────────────────────────── */}
        {items.length === 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: "var(--text-muted)", padding: 60 }}>
            <div style={{ display: "flex" }}><SearchX size={44} strokeWidth={1.5} /></div>
            <div style={{ fontSize: "1rem", fontWeight: 600 }}>
              {pastEnd
                ? `این نتایج ${faNum(totalPages)} صفحه دارد — صفحهٔ ${faNum(filters.page)} وجود ندارد`
                : "رسانه‌ای با این فیلترها یافت نشد"}
            </div>
            <Link
              href={pastEnd ? exploreHref({ ...filters, page: 1 }) : "/explore"}
              style={{ padding: "8px 20px", borderRadius: 8, fontSize: "0.82rem", border: "1px solid var(--border)", color: "var(--accent)", textDecoration: "none" }}
            >
              {pastEnd ? "بازگشت به صفحهٔ اول" : "پاک کردن فیلترها"}
            </Link>
          </div>
        ) : (
          <>
            <ExploreResults items={items} view={filters.view} />

            {totalPages > 1 && (
              <nav aria-label="صفحه‌بندی" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "20px 20px 32px" }}>
                <PageLink filters={filters} to={filters.page - 1} disabled={filters.page <= 1}>‹ قبلی</PageLink>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "0 8px" }}>
                  صفحه {faNum(filters.page)} از {faNum(totalPages)}
                </span>
                <PageLink filters={filters} to={filters.page + 1} disabled={filters.page >= totalPages}>بعدی ›</PageLink>
              </nav>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

/**
 * One step of the pager.
 *
 * A real `<a href>` rather than a button, so each page of the catalogue has an
 * address a crawler can follow and a visitor can bookmark. Next still moves
 * between them without reloading the document.
 */
function PageLink({
  filters, to, disabled, children,
}: {
  filters: Parameters<typeof exploreHref>[0];
  to: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const style: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    color: "var(--text-main)",
    fontFamily: "inherit",
    fontSize: "0.85rem",
    fontWeight: 600,
    padding: "9px 20px",
    borderRadius: 9,
    textDecoration: "none",
  };

  if (disabled) {
    return <span aria-disabled="true" style={{ ...style, opacity: 0.4, cursor: "not-allowed" }}>{children}</span>;
  }
  return <Link href={exploreHref({ ...filters, page: to })} scroll={false} style={style}>{children}</Link>;
}
