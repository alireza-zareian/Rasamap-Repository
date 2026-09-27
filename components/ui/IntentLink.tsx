"use client";
import Link from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * A link that prefetches when the visitor shows intent — a pointer arriving, a
 * finger touching down, keyboard focus — instead of when it scrolls into view.
 *
 * For links that come in lists: cards, carousel slides, the ticker, the pager,
 * the footer. A plain <Link> prefetches every one of them on sight, and each
 * prefetch is a request the server renders. Measured with a real browser
 * loading a page and scrolling it once: 63 background requests on the landing,
 * 91 on the catalogue, almost all for media pages nobody opened — about 95% of
 * the server time one visit cost. The header's handful of links stay plain
 * <Link>s: those are the navigations worth having instant.
 *
 * This is the "hover-triggered prefetch" pattern from Next's own prefetching
 * guide; `prefetch={null}` restores the default once intent is shown. A touch
 * lands roughly 100 ms before its click, which is when a phone starts fetching.
 */
export default function IntentLink({ onPointerEnter, onTouchStart, onFocus, ...props }: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={intent ? null : false}
      onPointerEnter={e => { setIntent(true); onPointerEnter?.(e); }}
      onTouchStart={e => { setIntent(true); onTouchStart?.(e); }}
      onFocus={e => { setIntent(true); onFocus?.(e); }}
    />
  );
}
