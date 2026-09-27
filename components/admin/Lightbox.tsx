"use client";
import { X } from "lucide-react";
import { useModalA11y } from "@/lib/client/use-modal-a11y";
import styles from "./Lightbox.module.css";

/**
 * One enlarged photograph, over everything else.
 *
 * Both admin panels had their own copy of this — same markup, same backdrop,
 * and neither with a close button, a dialog role or an Escape key. Reviewing
 * submitted photographs is most of what the approval screen is for, so being
 * able to open one and then not being able to shut it without reaching for the
 * mouse is a real dead end.
 *
 * `useModalA11y` supplies Escape, focus moving in and back out, and the tab
 * loop; this only has to declare what it is and give the keyboard something to
 * land on.
 */
export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const boxRef = useModalA11y<HTMLDivElement>(onClose);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div ref={boxRef} role="dialog" aria-modal="true" aria-label="نمای بزرگ تصویر" tabIndex={-1}
        className={styles.frame} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.close} onClick={onClose} aria-label="بستن نمای بزرگ"><X size={18} /></button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" />
      </div>
    </div>
  );
}
