"use client";
import { X } from "lucide-react";
import { useModalA11y } from "@/lib/client/use-modal-a11y";
import styles from "./Lightbox.module.css";

/** One enlarged photo, over everything; useModalA11y supplies Escape, focus and the tab loop. */
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
