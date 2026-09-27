"use client";
import { useEffect, useRef } from "react";
import styles from "./BackgroundPattern.module.css";

export default function BackgroundPattern() {
  const vine1Ref = useRef<SVGPathElement>(null);
  const vine2Ref = useRef<SVGPathElement>(null);
  const vine3Ref = useRef<SVGPathElement>(null);

  useEffect(() => {
    // ── Pause every decorative animation while the tab is hidden ────
    // One listener that fires only on tab switch / minimise. Without it the
    // orbs and text shimmers keep compositing forever in a background tab.
    const onVisibility = () =>
      document.documentElement.classList.toggle("page-hidden", document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();

    // ── Vines: draw once on mount, then leave them alone ────────────
    // No scroll / mousemove listeners — the orbs keep drifting via CSS
    // keyframes, but nothing here runs per frame while the user scrolls.
    const paths = [vine1Ref.current, vine2Ref.current, vine3Ref.current]
      .filter(Boolean) as SVGPathElement[];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;

    if (paths.length > 0) {
      const lengths = paths.map(p => p.getTotalLength());
      paths.forEach((p, i) => {
        p.style.strokeDasharray = String(lengths[i]);
        p.style.strokeDashoffset = reduce ? "0" : String(lengths[i]);
      });

      if (!reduce) {
        // Next frame: enable a transition and let each vine draw itself in.
        raf = requestAnimationFrame(() => {
          paths.forEach((p, i) => {
            p.style.transition = `stroke-dashoffset 2.6s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.35}s`;
            p.style.strokeDashoffset = "0";
          });
        });
      }
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.documentElement.classList.remove("page-hidden");
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className={styles.decor} aria-hidden="true">
      {/* Blue top-left, green bottom-right, mid-blue right, pink bottom-left. */}
      {(["one", "two", "three", "four"] as const).map((pos, i) => (
        <div key={pos} className={`${styles.anchor} ${styles[pos]}`}>
          <div className={`${styles.orb} bg-orb-${i + 1}`} />
        </div>
      ))}

      <div className={styles.vines}>
        <svg viewBox="0 0 1440 1080" preserveAspectRatio="xMidYMid slice">
          <path ref={vine1Ref}
            d="M 1380,0 C 1160,160 1300,330 1060,470 C 820,610 1020,760 800,890 C 580,1020 660,1100 420,1080"
            fill="none" stroke="rgba(0,209,122,0.28)" strokeWidth="1.8" strokeLinecap="round" />
          <path ref={vine2Ref}
            d="M 40,0 C 220,200 80,360 260,520 C 440,680 260,800 380,960"
            fill="none" stroke="rgba(0,209,122,0.16)" strokeWidth="1.2" strokeLinecap="round" />
          <path ref={vine3Ref}
            d="M 720,0 C 600,180 840,320 700,500 C 560,680 780,780 680,1000"
            fill="none" stroke="rgba(59,123,245,0.12)" strokeWidth="1" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
