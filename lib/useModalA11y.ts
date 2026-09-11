"use client";
import { useEffect, useRef } from "react";

/**
 * The three things a dialog owes a keyboard.
 *
 * Every modal in the app had the same three gaps, so this exists once rather
 * than seven times (rule 10). It gives the caller a ref to put on the dialog
 * box and handles:
 *
 *  1. **Escape closes it.** The expectation is universal, and without it a
 *     keyboard user who opens a modal has no way out but Tab-hunting for the
 *     close button.
 *  2. **Focus moves in, and comes back out.** On open, focus lands inside the
 *     dialog; on close it returns to whatever opened it. Without the second
 *     half, closing a modal drops focus to the top of the document and the
 *     visitor has to tab through the whole page to get back.
 *  3. **Tab stays inside.** An open dialog that lets Tab wander into the page
 *     behind it is reading out content the visitor cannot see or click.
 *
 * `onClose` is read through a ref so a caller passing an inline arrow function
 * — which is every caller — does not re-run the effect and re-steal focus on
 * each render.
 */
export function useModalA11y<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T | null>(null);
  const closeRef = useRef(onClose);

  // Kept current in its own effect rather than assigned during render — writing
  // to a ref while rendering is not allowed, and React's lint rule says so.
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

    // Prefer the first real control; fall back to the box itself, which needs a
    // tabIndex of -1 to be focusable at all (the caller sets it).
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
      // Only take focus back if it is still inside the dialog being torn down —
      // otherwise a close that already moved focus somewhere deliberate (a
      // redirect, a newly revealed field) would have it yanked away.
      if (!box.contains(document.activeElement)) return;
      opener?.focus?.();
    };
  }, []);

  return ref;
}
