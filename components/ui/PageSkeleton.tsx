import styles from "./PageSkeleton.module.css";

/**
 * The shape a page holds while its server render is in flight; each route's
 * loading.tsx names a layout. `.skeleton` (globals.css) shimmers and pauses
 * with a hidden tab.
 *
 * Do not add a loading.tsx to a route that calls notFound(), such as
 * app/(site)/billboard/[slug]/: the Suspense shell sends the status line
 * first, so the 404 becomes a 200 — and a listing in review must look like one
 * that does not exist. The test "an unpublished listing stays a 404 for a guest
 * and for a customer" guards it.
 */

/** A shimmering block; its size is per call, so an inline style. */
function Bar({ w, h = 14, r = 7, mb = 0 }: { w: string | number; h?: number; r?: number; mb?: number }) {
  return (
    <div
      className="skeleton"
      style={{ width: w, height: h, borderRadius: r, marginBottom: mb }}
      aria-hidden="true"
    />
  );
}

/** Each mirrors its page's first screen, so content lands where the placeholder was. */
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
            {/* At the gallery's real aspect ratio. */}
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
