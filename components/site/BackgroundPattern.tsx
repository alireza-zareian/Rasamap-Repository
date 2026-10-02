"use client";
import { useEffect } from "react";
import styles from "./BackgroundPattern.module.css";

// How long after the last scroll event a still pointer gets its hover back.
// Long enough to bridge wheel notches a fifth of a second apart: at 150 ms,
// hover came back between them and the cards re-ran their transitions on
// every notch (/explore, 20 notches: 4.9 s of browser CPU, 2.2 s at 250 ms).
const HOVER_RESUME_MS = 250;

/**
 * The backdrop behind every page: three soft lights on a desktop, none on a
 * phone. It also marks the document while the tab is hidden, which pauses
 * every infinite animation on the globals.css list (§22), and while the page
 * scrolls, which suspends hover on the content (globals.css, §44).
 *
 * Three "vine" strokes used to draw themselves across it on load. They ran
 * through the cards and forms in front — every card is translucent — and read
 * as stray lines over the content, so they are gone.
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

  return <div className={styles.decor} aria-hidden="true" />;
}
