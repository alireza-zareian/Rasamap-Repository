"use client";
import { X } from "lucide-react";
import { useModalA11y } from "@/lib/useModalA11y";

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
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(6,10,18,0.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label="نمای بزرگ تصویر"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ position: "relative", maxWidth: "100%", maxHeight: "100%", outline: "none" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="بستن نمای بزرگ"
          style={{ position: "absolute", top: 8, left: 8, background: "rgba(255,255,255,0.16)", border: "none", color: "#fff", width: 34, height: 34, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <X size={18} />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" style={{ maxWidth: "92vw", maxHeight: "88vh", objectFit: "contain", borderRadius: 12, display: "block" }} />
      </div>
    </div>
  );
}
