"use client";
import { useRef, type ReactNode } from "react";

/**
 * The window around a CSS marquee, made draggable: the animation holds while a
 * pointer is down, and the window scrolls natively, momentum and all.
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
