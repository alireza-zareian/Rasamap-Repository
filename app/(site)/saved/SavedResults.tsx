"use client";
import { Heart } from "lucide-react";
import type { CatalogueItem } from "@/lib/types";
import { useFavorites } from "@/components/favorites/FavoritesProvider";
import { ButtonLink } from "@/components/ui/Button";
import ExploreResults from "../explore/ExploreResults";
import styles from "./saved.module.css";

/**
 * The saved grid. A heart tapped off here takes its card away at once; the
 * server list the page was rendered with is only the starting point.
 */
export default function SavedResults({ items }: { items: CatalogueItem[] }) {
  const { isSaved, loaded } = useFavorites();
  // Until the hearts have loaded, the server's list is the truth.
  const shown = loaded ? items.filter(b => isSaved(b.slug)) : items;

  if (shown.length === 0) {
    return (
      <div className={styles.empty}>
        <Heart size={44} strokeWidth={1.4} className={styles.emptyIcon} />
        <h2 className={styles.emptyTitle}>هنوز چیزی ذخیره نکرده‌اید</h2>
        <p className={styles.emptyText}>در جستجو روی قلبِ هر رسانه بزنید تا این‌جا بماند.</p>
        <ButtonLink href="/explore" intent="primary">رفتن به جستجو</ButtonLink>
      </div>
    );
  }
  return <ExploreResults items={shown} view="grid" />;
}
