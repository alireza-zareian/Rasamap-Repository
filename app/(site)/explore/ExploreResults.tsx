"use client";
import { useState, useCallback } from "react";
import type { CatalogueItem } from "@/lib/types";
import BillboardCard from "@/components/BillboardCard";
import CompareModal from "@/components/CompareModal";
import CompareBar from "@/components/CompareBar";
import Toast from "@/components/Toast";
import { MAX_COMPARE, useCompareList } from "@/lib/client/use-compare-list";
import styles from "./explore.module.css";

/**
 * The results grid.
 *
 * The cards themselves come from the server: this component receives them as
 * props and never fetches. It is a Client Component only because comparison is
 * a browser-side selection — which two records the visitor has ticked, held in
 * localStorage so /compare can pick them up (lib/client/use-compare-list.ts). A Client Component is still
 * rendered to HTML on the server, so the prices, names and photos are in the
 * document either way; what "use client" buys here is the tick box working.
 */

interface ToastState { msg: string; type: "success" | "error" | "info" }

export default function ExploreResults({ items, view }: { items: CatalogueItem[]; view: "grid" | "list" }) {
  const { items: compareList, setItems: setCompareList, remove, clear, ready } = useCompareList();
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // The updater stays pure — it only computes the next list. It used to call
  // setToast from inside it, which React does not allow: an updater may be
  // run again or reordered when a click lands while the page is still
  // hydrating, and the side effect then fired at the wrong time or not at all.
  // The message is decided from the list as it is on screen.
  const handleCompare = useCallback((b: CatalogueItem) => {
    const inList = compareList.some(x => x.id === b.id);
    if (!inList && compareList.length >= MAX_COMPARE) {
      setToast({ msg: `حداکثر ${MAX_COMPARE} رسانه را می‌توانید مقایسه کنید`, type: "error" });
      return;
    }
    setCompareList(prev => prev.some(x => x.id === b.id)
      ? prev.filter(x => x.id !== b.id)
      : [...prev, b].slice(0, MAX_COMPARE));
    if (!inList) setToast({ msg: `${b.name.substring(0, 22)}... به مقایسه اضافه شد`, type: "info" });
  }, [compareList, setCompareList]);

  return (
    <>
      {/* Busy until the saved compare selection has been read: a tick made
          before that is a tick on a page that is not listening yet. */}
      <div className={view === "grid" ? styles.grid : styles.list} data-testid="results" aria-busy={!ready}>
        {items.map(b => (
          <BillboardCard
            key={b.id}
            billboard={b}
            isCompared={compareList.some(x => x.id === b.id)}
            onCompare={() => handleCompare(b)}
            listMode={view === "list"}
          />
        ))}
      </div>

      {showCompareModal && compareList.length >= MAX_COMPARE && (
        <CompareModal items={compareList} onClose={() => setShowCompareModal(false)} />
      )}
      <CompareBar
        items={compareList}
        onRemove={remove}
        onCompare={() => setShowCompareModal(true)}
        onClear={clear}
      />
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
