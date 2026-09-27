"use client";
import { useState, useCallback, useRef, ViewTransition } from "react";
import Image from "next/image";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useModalA11y } from "@/lib/client/use-modal-a11y";
import { NoImagePlaceholder } from "@/components/MediaImage";
import { mediaPhotoTransition } from "@/components/ui/transitions";
import styles from "./detail.module.css";

interface Props {
  images: string[];
  name: string;
  /** The media type, for the placeholder drawn when there is no photo. */
  type: string;
  /** The media's slug — names the morph from its catalogue card. */
  slug: string;
}

// Below this, a horizontal drag counts as a swipe rather than a stray touch.
const SWIPE_PX = 45;

export default function BillboardGallery({ images, name, type, slug }: Props) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  // Crawled photos live on the sources' servers and some of them are gone.
  // A photo that fails is drawn as the media's placeholder everywhere it
  // appears — main view, thumbnail and lightbox — instead of the browser's
  // torn-image icon.
  const [broken, setBroken] = useState<ReadonlySet<number>>(new Set());
  const markBroken = useCallback((i: number) => setBroken(b => new Set(b).add(i)), []);

  const prev = useCallback(() => setActive(i => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setActive(i => (i + 1) % images.length), [images.length]);

  // Touch swipe — the only way to move between images on a phone, where the
  // lightbox arrows sit at the screen edge and there is no keyboard.
  const touchX = useRef<number | null>(null);
  const swipedAt = useRef(0);
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null || images.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < SWIPE_PX) return;
    swipedAt.current = Date.now();
    // Drag left → next image, drag right → previous — the convention every
    // photo viewer uses, RTL page or not.
    (dx < 0 ? next : prev)();
  };
  // A swipe ends in a synthetic click; on the main image that would pop the
  // lightbox open, so swallow the click that lands right after one.
  const openLightbox = () => { if (Date.now() - swipedAt.current > 250) setLightbox(true); };

  if (!images.length) {
    return (
      <ViewTransition name={mediaPhotoTransition(slug)} share="media-morph">
        <div className={styles.empty}><NoImagePlaceholder type={type} iconSize={48} /></div>
      </ViewTransition>
    );
  }

  return (
    <>
      {/* A real <button>, so a keyboard can open the photographs too. */}
      <ViewTransition name={mediaPhotoTransition(slug)} share="media-morph">
        <button type="button" className={styles.stage} onClick={openLightbox} aria-label={`بزرگ‌نمایی تصویر ${name}`}
          onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {broken.has(active)
            ? <NoImagePlaceholder type={type} iconSize={48} />
            : <Image key={active} src={images[active]} alt={name} fill sizes="(max-width: 900px) 100vw, 640px"
                decoding="async" loading="eager" fetchPriority="high" onError={() => markBroken(active)} />}
          {images.length > 1 && <span className={`${styles.pill} ${styles.counter}`}>{active + 1} / {images.length}</span>}
          <span className={`${styles.pill} ${styles.zoom}`}><Search size={12} /> بزرگ‌نمایی</span>
        </button>
      </ViewTransition>

      {images.length > 1 && (
        <div className={styles.thumbs}>
          {images.map((src, i) => (
            <button key={i} type="button" className={styles.thumb} onClick={() => setActive(i)}
              aria-label={`نمایش تصویر ${i + 1} از ${images.length}`} aria-current={i === active}>
              {/* Eager: a gallery has a handful of photos, and a lazy image
                  inside a horizontal scroller is one a phone may never ask for
                  (AGENTS.md rule 9). */}
              {broken.has(i)
                ? <NoImagePlaceholder type={type} iconSize={16} />
                : <Image src={src} alt="" fill sizes="72px" loading="eager" decoding="async" onError={() => markBroken(i)} />}
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <GalleryLightbox
          images={images}
          name={name}
          type={type}
          active={active}
          broken={broken.has(active)}
          onBroken={() => markBroken(active)}
          onPrev={prev}
          onNext={next}
          onClose={() => setLightbox(false)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        />
      )}
    </>
  );
}

/**
 * The enlarged image, as a component of its own rather than a branch.
 *
 * That is what lets it use `useModalA11y`: the hook wires itself up once, when
 * the element it is given exists, so a dialog that appears and disappears has
 * to mount and unmount with it — which is why every other dialog in the app is
 * built this way.
 *
 * This was the last one that was not, and it showed. It had its own Escape key
 * bound to `window`, no focus trap — Tab wandered into the page behind the
 * overlay, reading out a catalogue the visitor could not see — and no way back
 * to the button that opened it, so closing dropped focus at the top of the
 * document. The arrow keys stay here, because moving between photographs is
 * this dialog's own business and not something every dialog needs.
 */
function GalleryLightbox({
  images, name, type, active, broken, onBroken, onPrev, onNext, onClose, onTouchStart, onTouchEnd,
}: {
  images: string[];
  name: string;
  type: string;
  active: number;
  broken: boolean;
  onBroken: () => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}) {
  const boxRef = useModalA11y<HTMLDivElement>(onClose);

  return (
    <div
      ref={boxRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`تصاویر ${name}`}
      className={styles.lightbox}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onPrev();
        else if (e.key === "ArrowRight") onNext();
      }}
      onClick={onClose}
    >
      <div className={styles.lightboxFrame} onClick={e => e.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {broken
          ? <div className={styles.lightboxBroken}><NoImagePlaceholder type={type} iconSize={64} /></div>
          : <Image key={active} src={images[active]} alt={name} width={500} height={500} sizes="90vw" className={styles.lightboxImage} onError={onBroken} />}
        {images.length > 1 && (
          <>
            <button type="button" onClick={onPrev} aria-label="تصویر قبلی" className={`${styles.round} ${styles.arrow} ${styles.prev}`}><ChevronRight size={22} /></button>
            <button type="button" onClick={onNext} aria-label="تصویر بعدی" className={`${styles.round} ${styles.arrow} ${styles.next}`}><ChevronLeft size={22} /></button>
          </>
        )}
        <button type="button" onClick={onClose} aria-label="بستن نمای بزرگ" className={`${styles.round} ${styles.close}`}><X size={16} /></button>
        <div className={styles.lightboxCount}>{active + 1} / {images.length}</div>
      </div>
    </div>
  );
}
