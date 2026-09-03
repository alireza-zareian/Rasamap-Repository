"use client";
import { useRef, type ReactNode, type CSSProperties } from "react";

/**
 * The window around a CSS marquee, made draggable.
 *
 * The strip inside keeps animating on its own (a GPU transform, no per-frame
 * JavaScript — see §22). This adds the one thing CSS cannot: while a finger or
 * a mouse button is down the animation holds still, and because the window is a
 * real horizontal scroll container the drag itself is native scrolling, with
 * the platform's own momentum and rubber-banding. Letting go resumes the drift
 * from wherever it stopped.
 */
export default function SwipeMarquee({
  className = "",
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const hold    = () => ref.current?.classList.add("marquee-held");
  const release = () => ref.current?.classList.remove("marquee-held");

  return (
    <div
      ref={ref}
      className={className}
      style={style}
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
