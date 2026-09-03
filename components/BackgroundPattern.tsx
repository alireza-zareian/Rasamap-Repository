"use client";
import { useEffect, useRef } from "react";

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
    <div className="bg-decor" aria-hidden="true" style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden" }}>

      {/* Orb 1 — blue, top-left */}
      <div style={{ position: "absolute", top: -180, left: "6%" }}>
        <div className="bg-orb-1" style={{
          width: 900, height: 900, borderRadius: "50%",
          animation: "orb-drift-1 32s ease-in-out infinite",
        }} />
      </div>

      {/* Orb 2 — green, bottom-right */}
      <div style={{ position: "absolute", bottom: -160, right: "4%" }}>
        <div className="bg-orb-2" style={{
          width: 780, height: 780, borderRadius: "50%",
          animation: "orb-drift-2 26s ease-in-out infinite",
          animationDelay: "-10s",
        }} />
      </div>

      {/* Orb 3 — mid-blue, right center */}
      <div style={{ position: "absolute", top: "28%", right: -60 }}>
        <div className="bg-orb-3" style={{
          width: 560, height: 560, borderRadius: "50%",
          animation: "orb-drift-3 20s ease-in-out infinite",
          animationDelay: "-4s",
        }} />
      </div>

      {/* Orb 4 — pink, bottom-left */}
      <div style={{ position: "absolute", bottom: -80, left: "22%" }}>
        <div className="bg-orb-4" style={{
          width: 640, height: 640, borderRadius: "50%",
          animation: "orb-drift-1 28s ease-in-out infinite",
          animationDelay: "-16s",
        }} />
      </div>

      {/* Vine — static container, drawn once on mount */}
      <div style={{ position: "absolute", inset: "-15% 0 0 0" }}>
        <svg viewBox="0 0 1440 1080" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "130%" }}>
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
