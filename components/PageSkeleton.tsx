import styles from "./PageSkeleton.module.css";

/**
 * The shape a page holds while its server render is in flight.
 *
 * There were two of these before, one per `loading.tsx`, identical apart from
 * their message and each injecting its own copy of the same `@keyframes`. A
 * third and fourth copy is how four spellings of one thing start (rule 10), so
 * the markup lives here and each route's `loading.tsx` is a single line that
 * names its layout.
 *
 * `.skeleton` comes from globals.css, which already shimmers it and already
 * pauses it under `html.page-hidden` — a loading screen in a backgrounded tab
 * has no business waking the GPU (§22).
 *
 * ── Do not add a loading.tsx to a route that calls notFound() ───────────────
 *
 * `app/billboard/[slug]/` is the obvious next candidate and it must not have
 * one. A loading.tsx wraps the route in a Suspense boundary, and Next then
 * sends the shell — status line included — before the page component runs. The
 * 404 that `notFound()` raises afterwards can no longer set the status code, so
 * the response becomes 200 with the not-found body streamed into it.
 *
 * That is not cosmetic on this route: a listing still awaiting approval is
 * meant to be indistinguishable from one that does not exist, and a 200 tells a
 * crawler the address is real. The test "an unpublished listing stays a 404 for
 * a guest and for a customer" catches it, which is how it was caught here.
 */

/** A shimmering block. Its size is per call, so it stays an inline style. */
function Bar({ w, h = 14, r = 7, mb = 0 }: { w: string | number; h?: number; r?: number; mb?: number }) {
  return (
    <div
      className="skeleton"
      style={{ width: w, height: h, borderRadius: r, marginBottom: mb }}
      aria-hidden="true"
    />
  );
}

/**
 * Which arrangement of blocks to draw.
 *
 * Each mirrors the real page's first screen closely enough that the content
 * lands roughly where the placeholder was, rather than shifting the page as it
 * arrives — the cost a bare centred spinner does not pay but the visitor does.
 */
export type SkeletonLayout = "detail" | "table" | "cards";

const Block = ({ className }: { className: string }) => <div className={`skeleton ${className}`} aria-hidden="true" />;

export default function PageSkeleton({
  layout,
  label,
  inPanel = false,
}: {
  layout: SkeletonLayout;
  /** Announced to a screen reader, which cannot see the shimmer. */
  label: string;
  /** Inside the admin shell, which already has its own bar and frame. */
  inPanel?: boolean;
}) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={`${styles.page} ${inPanel ? styles.panel : ""}`}>
      <div className={styles.wrap}>
        {layout === "detail" && (
          <>
            {/* The photograph, at the aspect ratio the gallery really uses, so
                the rest of the page does not jump when it arrives. */}
            <Block className={styles.photo} />
            <Bar w="52%" h={26} r={9} mb={12} />
            <Bar w="34%" h={16} mb={26} />
            <div className={styles.chips}>{[0, 1, 2, 3].map(i => <Block key={i} className={styles.chip} />)}</div>
            <Bar w="100%" h={13} mb={9} />
            <Bar w="92%" h={13} mb={9} />
            <Bar w="68%" h={13} />
          </>
        )}

        {layout === "table" && (
          <>
            <Bar w="30%" h={24} r={9} mb={20} />
            <div className={styles.filters}>{[0, 1, 2].map(i => <Block key={i} className={styles.filter} />)}</div>
            {Array.from({ length: 8 }, (_, i) => <Block key={i} className={styles.row} />)}
          </>
        )}

        {layout === "cards" && (
          <>
            <Bar w="26%" h={24} r={9} mb={20} />
            <div className={styles.cards}>
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i}>
                  <Block className={styles.cardPhoto} />
                  <Bar w="80%" h={13} mb={7} />
                  <Bar w="50%" h={12} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
