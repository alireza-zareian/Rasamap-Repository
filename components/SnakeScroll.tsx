"use client";
import { useEffect, useRef } from "react";

interface Props {
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
}

export default function SnakeScroll({ scrollContainerRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);
  const cur       = useRef(0); // current progress 0-1
  const tgt       = useRef(0); // target progress 0-1

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      canvas.width  = 44;
      canvas.height = window.innerHeight - 62;
    };
    resize();
    window.addEventListener("resize", resize);

    // Listen on the scrollable list container, not window
    const getEl = () =>
      scrollContainerRef?.current ??
      document.getElementById("billboardList") ??
      document.querySelector(".billboard-list") ??
      null;

    const onScroll = (e: Event) => {
      const el = e.currentTarget as HTMLElement;
      const max = el.scrollHeight - el.clientHeight;
      tgt.current = max > 0 ? el.scrollTop / max : 0;
    };

    // Attach after short delay so DOM is ready
    const timer = setTimeout(() => {
      const el = getEl();
      if (el) el.addEventListener("scroll", onScroll as EventListener, { passive: true });
    }, 800);

    const draw = (ts: number) => {
      cur.current += (tgt.current - cur.current) * 0.07;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const len   = H * cur.current;
      const segs  = Math.max(2, Math.floor(len / 6));
      const cx    = W / 2;
      const amp   = 12;

      const pts = Array.from({ length: segs + 1 }, (_, i) => {
        const t = i / segs;
        return {
          x: cx + Math.sin(len * t * 0.022 + ts * 0.0009) * amp,
          y: len * t,
        };
      });

      if (pts.length < 2) { animRef.current = requestAnimationFrame(draw); return; }

      // Glow pass
      ctx.save();
      ctx.shadowColor  = "rgba(59,123,245,0.6)";
      ctx.shadowBlur   = 12;
      ctx.strokeStyle  = "#3B7BF5";
      ctx.lineWidth    = 6;
      ctx.globalAlpha  = 0.25;
      ctx.lineCap = ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i+1].x) / 2;
        const my = (pts[i].y + pts[i+1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      ctx.stroke();
      ctx.restore();

      // Main line — gradient fade from top
      const grad = ctx.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0,   "transparent");
      grad.addColorStop(0.25, "#3B7BF555");
      grad.addColorStop(0.8,  "#3B7BF5");
      grad.addColorStop(1,    "#3B7BF5");
      ctx.save();
      ctx.shadowColor = "rgba(59,123,245,0.5)";
      ctx.shadowBlur  = 6;
      ctx.strokeStyle = grad;
      ctx.lineWidth   = 2.5;
      ctx.lineCap = ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i+1].x) / 2;
        const my = (pts[i].y + pts[i+1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      ctx.lineTo(pts[pts.length-1].x, pts[pts.length-1].y);
      ctx.stroke();
      ctx.restore();

      // Head
      if (cur.current > 0.01) {
        const h = pts[pts.length - 1];
        const rg = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, 9);
        rg.addColorStop(0, "#fff");
        rg.addColorStop(0.35, "#3B7BF5");
        rg.addColorStop(1, "transparent");
        ctx.save();
        ctx.shadowColor = "rgba(59,123,245,0.8)"; ctx.shadowBlur = 16;
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(h.x, h.y, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(h.x, h.y, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // % label
        ctx.save();
        ctx.fillStyle = "#3B7BF5";
        ctx.font = "bold 8px monospace";
        ctx.textAlign = "center";
        ctx.globalAlpha = Math.min(1, cur.current * 8);
        ctx.fillText(`${Math.round(cur.current * 100)}%`, h.x, h.y + 16);
        ctx.restore();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      clearTimeout(timer);
      const el = getEl();
      if (el) el.removeEventListener("scroll", onScroll as EventListener);
    };
  // Runs once on mount; the scroll target is resolved lazily via getEl().
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas ref={canvasRef} style={{
      position: "absolute", top: 0, left: 0,
      width: 44, pointerEvents: "none", zIndex: 40,
    }} />
  );
}
