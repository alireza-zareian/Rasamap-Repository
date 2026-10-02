"use client";
import { useEffect } from "react";

// How long after the last scroll event a still pointer gets its hover back.
// Long enough to bridge wheel notches a fifth of a second apart: at 150 ms,
// hover came back between them and the cards re-ran their transitions on
// every notch (/explore, 20 notches: 4.9 s of browser CPU, 2.2 s at 250 ms).
const HOVER_RESUME_MS = 250;

/**
 * Marks the document while the tab is hidden, which pauses every infinite
 * animation on the globals.css list (§22), and while the page scrolls, which
 * suspends hover on the content (globals.css, §44).
 *
 * It used to draw the backdrop too: four drifting orbs, then three lights on
 * a fixed layer. The lights are the page's own background now (body in
 * globals.css), so nothing here renders.
 */
export default function BackgroundPattern() {
  useEffect(() => {
    const onVisibility = () =>
      document.documentElement.classList.toggle("page-hidden", document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.documentElement.classList.remove("page-hidden");
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    let timer: number | undefined;
    const onScroll = () => {
      if (timer === undefined) root.classList.add("is-scrolling");
      else clearTimeout(timer);
      timer = window.setTimeout(() => {
        root.classList.remove("is-scrolling");
        timer = undefined;
      }, HOVER_RESUME_MS);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
      root.classList.remove("is-scrolling");
    };
  }, []);

  return null;
}
