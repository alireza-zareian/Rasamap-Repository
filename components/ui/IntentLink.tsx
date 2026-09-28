"use client";
import Link from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * A link that prefetches on intent — a pointer, a touch, keyboard focus —
 * rather than on sight. For links in lists (cards, slides, ticker, pager,
 * footer): a plain <Link> prefetches each one it sees, and each is a request
 * the server renders. One visit to the catalogue, loaded and scrolled: 91
 * background requests before, 22 after; server CPU 660 → 440 ms (§38). The
 * header's links stay plain <Link>s, to keep main navigation instant.
 *
 * The "hover-triggered prefetch" pattern from Next's prefetching guide;
 * `prefetch={null}` restores the default once intent is shown.
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
