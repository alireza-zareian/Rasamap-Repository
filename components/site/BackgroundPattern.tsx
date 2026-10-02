"use client";
import { useEffect } from "react";
import styles from "./BackgroundPattern.module.css";

/**
 * The backdrop behind every page: three soft lights on a desktop, none on a
 * phone. It also marks the document while the tab is hidden, which pauses
 * every infinite animation on the globals.css list (§22).
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

  return <div className={styles.decor} aria-hidden="true" />;
}
