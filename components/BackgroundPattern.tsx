"use client";
import { useEffect, useRef } from "react";

export default function BackgroundPattern() {
  const containerRef = useRef<HTMLDivElement>(null);
  const vine1Ref = useRef<SVGPathElement>(null);
  const vine2Ref = useRef<SVGPathElement>(null);
  const vine3Ref = useRef<SVGPathElement>(null);

  const orb1Ref = useRef<HTMLDivElement>(null);
  const orb2Ref = useRef<HTMLDivElement>(null);
  const orb3Ref = useRef<HTMLDivElement>(null);
  const orb4Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // ── Vine scroll-draw ────────────────────────────────────────────
    const paths = [vine1Ref.current, vine2Ref.current, vine3Ref.current]
      .filter(Boolean) as SVGPathElement[];

    const lengths = paths.map(p => p.getTotalLength());
    paths.forEach((p, i) => {
      p.style.strokeDasharray = String(lengths[i]);
      p.style.strokeDashoffset = String(lengths[i]);
    });

    let scrollRafId = 0;
    let lastScrollY = -1;
    const ease = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    const onResize = () => { lastScrollY = -1; };
    window.addEventListener("resize", onResize, { passive: true });

    const drawVines = () => {
      const scrollY = window.scrollY;
      if (scrollY === lastScrollY) return;
      lastScrollY = scrollY;

      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const raw = Math.min(1, scrollY / maxScroll);

      const p0 = ease(Math.min(1, Math.max(0, (raw - 0.00) / 1.00)));
      const p1 = ease(Math.min(1, Math.max(0, (raw - 0.05) / 0.95)));
      const p2 = ease(Math.min(1, Math.max(0, (raw - 0.12) / 0.88)));

      if (paths[0]) paths[0].style.strokeDashoffset = String(lengths[0] * (1 - p0));
      if (paths[1]) paths[1].style.strokeDashoffset = String(lengths[1] * (1 - p1));
      if (paths[2]) paths[2].style.strokeDashoffset = String(lengths[2] * (1 - p2));

      if (containerRef.current) {
        containerRef.current.style.transform = `translateY(${scrollY * 0.12}px)`;
      }
    };

    const onScroll = () => {
      cancelAnimationFrame(scrollRafId);
      scrollRafId = requestAnimationFrame(drawVines);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    drawVines();

    // ── Cursor parallax on orbs ─────────────────────────────────────
    // Multipliers are large enough so movement is clearly visible on screen.
    // Negative mult = counter-movement (different depth layer).
    const orbs = [
      { ref: orb1Ref, multX: 0.06,  multY: 0.04  },  // front-blue — most
      { ref: orb2Ref, multX: -0.04, multY: -0.03 },  // back-green — counter
      { ref: orb3Ref, multX: 0.025, multY: 0.02  },  // mid-blue
      { ref: orb4Ref, multX: -0.05, multY: 0.035 },  // pink — diagonal
    ];

    let mouseX = 0, mouseY = 0;
    const cur = orbs.map(() => ({ x: 0, y: 0 }));
    let mouseRafId = 0;
    const LERP = 0.07;

    const lerpLoop = () => {
      let anyMoving = false;
      orbs.forEach(({ ref, multX, multY }, i) => {
        if (!ref.current) return;
        const targetX = mouseX * multX * window.innerWidth;
        const targetY = mouseY * multY * window.innerHeight;
        cur[i].x += (targetX - cur[i].x) * LERP;
        cur[i].y += (targetY - cur[i].y) * LERP;
        ref.current.style.transform = `translate(${cur[i].x | 0}px, ${cur[i].y | 0}px)`;
        if (Math.abs(targetX - cur[i].x) > 0.3 || Math.abs(targetY - cur[i].y) > 0.3) {
          anyMoving = true;
        }
      });
      mouseRafId = anyMoving ? requestAnimationFrame(lerpLoop) : 0;
    };

    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX / window.innerWidth - 0.5;
      mouseY = e.clientY / window.innerHeight - 0.5;
      if (!mouseRafId) mouseRafId = requestAnimationFrame(lerpLoop);
    };
    window.addEventListener("mousemove", onMouseMove, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      cancelAnimationFrame(scrollRafId);
      cancelAnimationFrame(mouseRafId);
    };
  }, []);

  return (
    <div aria-hidden="true" style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden" }}>

      {/* Orb 1 — blue, top-left, most cursor movement */}
      <div ref={orb1Ref} style={{ position: "absolute", top: -180, left: "6%", willChange: "transform" }}>
        <div className="bg-orb-1" style={{
          width: 900, height: 900, borderRadius: "50%",
          animation: "orb-drift-1 32s ease-in-out infinite",
        }} />
      </div>

      {/* Orb 2 — green, bottom-right, counter-moves */}
      <div ref={orb2Ref} style={{ position: "absolute", bottom: -160, right: "4%", willChange: "transform" }}>
        <div className="bg-orb-2" style={{
          width: 780, height: 780, borderRadius: "50%",
          animation: "orb-drift-2 26s ease-in-out infinite",
          animationDelay: "-10s",
        }} />
      </div>

      {/* Orb 3 — mid-blue, right center */}
      <div ref={orb3Ref} style={{ position: "absolute", top: "28%", right: -60, willChange: "transform" }}>
        <div className="bg-orb-3" style={{
          width: 560, height: 560, borderRadius: "50%",
          animation: "orb-drift-3 20s ease-in-out infinite",
          animationDelay: "-4s",
        }} />
      </div>

      {/* Orb 4 — pink, bottom-left */}
      <div ref={orb4Ref} style={{ position: "absolute", bottom: -80, left: "22%", willChange: "transform" }}>
        <div className="bg-orb-4" style={{
          width: 640, height: 640, borderRadius: "50%",
          animation: "orb-drift-1 28s ease-in-out infinite",
          animationDelay: "-16s",
        }} />
      </div>

      {/* Vine — scroll parallax container */}
      <div ref={containerRef} style={{ position: "absolute", inset: "-15% 0 0 0", willChange: "transform" }}>
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
