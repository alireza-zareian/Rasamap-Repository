"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Scale, X, ArrowLeft } from "lucide-react";
import { MAX_COMPARE, useCompareList } from "@/lib/client/use-compare-list";
import { fetchJson, FetchError } from "@/lib/client/fetch-json";
import MediaImage from "@/components/media/MediaImage";
import CompareTable from "@/components/compare/CompareTable";
import { ButtonLink } from "@/components/ui/Button";
import type { CatalogueItem } from "@/lib/types";
import { faNum } from "@/lib/format";
import styles from "./compare-page.module.css";

/** The media ticked on the catalogue, side by side. */
export default function ComparePage() {
  const { items, setItems, remove, ready } = useCompareList();
  const [notice, setNotice] = useState("");
  const [refreshed, setRefreshed] = useState(false);

  // The stored cards are a snapshot: re-read each, since a price may have moved or a listing gone.
  useEffect(() => {
    if (!ready || refreshed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRefreshed(true);
    if (items.length === 0) return;
    Promise.all(items.map(async b => {
      try {
        return (await fetchJson<{ billboard: CatalogueItem }>(`/api/billboards/${encodeURIComponent(b.slug)}`)).billboard;
      } catch (err) {
        // Gone or unpublished: drop it. Anything else (offline): keep the snapshot.
        return err instanceof FetchError && err.status === 404 ? null : b;
      }
    })).then(fresh => {
      const kept = fresh.filter((b): b is CatalogueItem => b !== null);
      if (kept.length < fresh.length) setNotice("رسانه‌ای که انتخاب کرده بودید دیگر در سایت نیست و از مقایسه برداشته شد.");
      setItems(kept);
    });
  }, [ready, refreshed, items, setItems]);

  if (!ready) return <main className={styles.main} />;

  return (
    <main className={styles.main}>
      <h1 className={styles.title}><Scale size={22} /> مقایسهٔ رسانه‌ها</h1>
      <p className={styles.lede}>رسانه‌های انتخابی از صفحهٔ جستجو را این‌جا کنار هم ببینید</p>
      {notice && <div role="status" className={styles.notice}>{notice}</div>}

      {items.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}><Scale size={48} /></div>
          <div className={styles.emptyTitle}>هنوز رسانه‌ای انتخاب نشده</div>
          <div className={styles.emptyText}>در صفحهٔ جستجو، دکمهٔ «مقایسه» روی دو رسانه را بزنید</div>
          <ButtonLink href="/explore" intent="primary"><ArrowLeft size={16} /> رفتن به جستجو</ButtonLink>
        </div>
      ) : (
        <>
          <div className={styles.cards}>
            {items.map(b => (
              <div key={b.id} className={styles.card}>
                <div className={styles.thumb}>
                  <MediaImage src={b.allImages?.[0] ?? b.images?.[0]} alt={b.name} type={b.type} sizes="256px" iconSize={26} />
                </div>
                <button type="button" className={styles.remove} onClick={() => remove(b.id)} aria-label={`حذف ${b.name} از مقایسه`}><X size={12} /></button>
                <div className={styles.cardBody}>
                  <div className={styles.cardName}>{b.name}</div>
                  <div className={styles.cardRegion}>{b.region}</div>
                  <div className={styles.cardFoot}>
                    <strong>{faNum(b.price)}M ت/ماه</strong>
                    <span>{faNum(b.width)}×{faNum(b.height)}م</span>
                  </div>
                </div>
              </div>
            ))}
            {items.length < MAX_COMPARE && (
              <Link href="/explore" className={styles.add}><Scale size={22} /> رسانهٔ دیگری انتخاب کنید</Link>
            )}
          </div>

          {items.length >= MAX_COMPARE && (
            <div className={styles.tableCard}><CompareTable items={[items[0], items[1]]} /></div>
          )}
          <div className={styles.more}>
            <ButtonLink href="/explore" size="sm"><ArrowLeft size={14} /> {items.length >= MAX_COMPARE ? "تغییر رسانه‌ها در جستجو" : "افزودن رسانهٔ دیگر از جستجو"}</ButtonLink>
          </div>
        </>
      )}
    </main>
  );
}
