import MediaImage from "@/components/media/MediaImage";
import type { CatalogueItem } from "@/lib/types";
import styles from "./hero-scene.module.css";

/** Boards standing in the scene; the module places each by its position. */
const SCENE_BOARDS = 6;

/** Where a line `z` px down the street sits between the horizon (0) and the
    near edge (100), for the 900px perspective the module sets. */
const depthY = (z: number) => 100 * (900 / (900 + z));
const CROSS_STREETS = [0, 150, 350, 600, 950, 1450, 2200, 3500].map(depthY);
const LANES = Array.from({ length: 17 }, (_, i) => -1500 + i * 250);

/**
 * The street grid, drawn flat in perspective. It used to be a 4000px plane
 * turned onto its back in 3D, which looked the same and cost about 300 ms of
 * main-thread time on every load to rasterise — measured, it was the whole of
 * the scene's cost. Twenty-five lines are nothing.
 */
function StreetGrid() {
  return (
    <svg className={styles.floor} viewBox="0 0 1000 100" preserveAspectRatio="none">
      {CROSS_STREETS.map(y => <line key={y} x1="-2000" y1={100 - y} x2="3000" y2={100 - y} />)}
      {LANES.map(x => <line key={x} x1="500" y1="0" x2={x} y2="100" />)}
    </svg>
  );
}

/**
 * The hero's backdrop: a street grid seen in perspective, with real media from
 * the catalogue standing on it. The boards fly in from the distance once, and
 * the whole scene moves towards the visitor as the page scrolls.
 *
 * It is CSS 3D rather than WebGL, and a Server Component: no script runs for
 * it, and every frame is a transform or an opacity the compositor draws (§37).
 * The photos are the carousel's own, at the carousel's `sizes`, so the browser
 * fetches each URL once for both and the server sends nothing extra.
 */
export default function HeroScene({ items }: { items: CatalogueItem[] }) {
  return (
    <div className={styles.scene} aria-hidden="true">
      <div className={styles.world}>
        <StreetGrid />
        {items.slice(0, SCENE_BOARDS).map(b => (
          <div key={b.id} className={styles.board}>
            <div className={styles.face}>
              {/* Not lazy: the board is on screen at load, and a transformed
                  element's visibility is what lazy loading misjudges (§24). */}
              <MediaImage src={b.images?.[0]} alt="" type={b.type} sizes="280px" eager iconSize={18} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
