"use client";
import { Heart } from "lucide-react";
import { useFavorites } from "./FavoritesProvider";
import styles from "./SaveButton.module.css";

/**
 * The heart that saves a media item (§40). `overlay` sits on a card's photo,
 * above the card's own link; `chip` is the labelled version on a media page.
 * Renders nothing for staff, who have no saved list.
 */
export default function SaveButton({ slug, name, variant = "overlay" }: {
  slug: string;
  name: string;
  /** `icon`: the chip without its label, square, for a toolbar. */
  variant?: "overlay" | "chip" | "icon";
}) {
  const { enabled, isSaved, isBusy, toggle } = useFavorites();
  if (!enabled) return null;
  const saved = isSaved(slug);

  return (
    <button
      type="button"
      className={`${styles.save} ${styles[variant]}`}
      aria-pressed={saved}
      aria-label={saved ? `حذف «${name}» از ذخیره‌شده‌ها` : `ذخیرهٔ «${name}»`}
      title={saved ? "حذف از ذخیره‌شده‌ها" : "ذخیره برای بعد"}
      disabled={isBusy(slug)}
      onClick={e => { e.preventDefault(); e.stopPropagation(); toggle(slug, name); }}
    >
      {/* key: a fresh icon on each change replays the pop */}
      <Heart key={String(saved)} className={styles.glyph} size={variant === "overlay" ? 17 : variant === "icon" ? 19 : 15} fill={saved ? "currentColor" : "none"} />
      {variant === "chip" && <span>{saved ? "ذخیره شد" : "ذخیره"}</span>}
    </button>
  );
}
