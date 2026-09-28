"use client";
import { useEffect, useRef } from "react";

/**
 * What a dialog owes a keyboard, for the ref the caller puts on the dialog box:
 *
 *  1. Escape closes it.
 *  2. Focus moves in on open, and back to the opener on close.
 *  3. Tab and Shift+Tab stay inside.
 *
 * `onClose` is read through a ref, so an inline arrow function does not re-run
 * the effect and steal focus on every render.
 */
export function useModalA11y<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T | null>(null);
  const closeRef = useRef(onClose);

  // In an effect: React does not allow writing a ref during render.
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const box = ref.current;
    if (!box) return;

    // Whatever had focus when the dialog opened — the button that opened it.
    const opener = document.activeElement as HTMLElement | null;

    const focusable = () =>
      Array.from(
        box.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);

    // The first control, else the box (the caller gives it tabIndex -1).
    (focusable()[0] ?? box).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      // Wrap at both ends, so Tab and Shift+Tab cycle within the dialog.
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    };

    box.addEventListener("keydown", onKey);
    return () => {
      box.removeEventListener("keydown", onKey);
      // Return focus to the opener unless something else has taken it. By now
      // React has detached the dialog, so focus is usually on <body> — which
      // means nobody claimed it.
      const focused = document.activeElement;
      if (focused && focused !== document.body && !box.contains(focused)) return;
      opener?.focus?.();
    };
  }, []);

  return ref;
}
