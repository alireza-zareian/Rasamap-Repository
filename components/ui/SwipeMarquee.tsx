"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * The window around a CSS marquee, made draggable: the animation holds while a
 * pointer is down, and the window scrolls natively, momentum and all.
 *
 * It also holds while the window is off screen. A running CSS animation is
 * serviced every frame wherever it is: the related strip, at the foot of a
 * media page and inside a `content-visibility: auto` section, cost a style
 * recalculation 60 times a second on a page nobody touched (measured, §44).
 */
export default function SwipeMarquee({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const hold    = () => ref.current?.classList.add("marquee-held");
  const release = () => ref.current?.classList.remove("marquee-held");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // A margin, so it is already moving when it scrolls into view.
    const observer = new IntersectionObserver(
      ([entry]) => el.classList.toggle("marquee-away", !entry.isIntersecting),
      { rootMargin: "200px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      onPointerDown={hold}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onTouchStart={hold}
      onTouchEnd={release}
      onTouchCancel={release}
    >
      {children}
    </div>
  );
}
