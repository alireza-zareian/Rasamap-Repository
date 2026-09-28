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
 * The results grid. The cards come from the server as props; this is a Client
 * Component only for the compare tick box (lib/client/use-compare-list.ts).
 * It still renders to HTML on the server.
 */

interface ToastState { msg: string; type: "success" | "error" | "info" }

export default function ExploreResults({ items, view }: { items: CatalogueItem[]; view: "grid" | "list" }) {
  const { items: compareList, setItems: setCompareList, remove, clear, ready } = useCompareList();
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // The updater stays pure — React may run it again during hydration — so the
  // toast is decided from the list as it is on screen.
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
      {/* Busy until the saved selection has been read. */}
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
