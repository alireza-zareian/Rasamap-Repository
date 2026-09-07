"use client";
import { useState, useCallback, useEffect } from "react";
import type { Billboard } from "@/lib/types";
import BillboardCard from "@/components/BillboardCard";
import CompareModal from "@/components/CompareModal";
import CompareBar from "@/components/CompareBar";
import Toast from "@/components/Toast";

/**
 * The results grid.
 *
 * The cards themselves come from the server: this component receives them as
 * props and never fetches. It is a Client Component only because comparison is
 * a browser-side selection — which two records the visitor has ticked, held in
 * localStorage so /compare can pick them up. A Client Component is still
 * rendered to HTML on the server, so the prices, names and photos are in the
 * document either way; what "use client" buys here is the tick box working.
 */

/** The compare tray holds two records — enough to put side by side, no more. */
const MAX_COMPARE = 2;
const COMPARE_KEY = "rasamap_compare";

interface ToastState { msg: string; type: "success" | "error" | "info" }

export default function ExploreResults({ items, view }: { items: Billboard[]; view: "grid" | "list" }) {
  const [compareList, setCompareList] = useState<Billboard[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Written on every change so the /compare page, a separate document, reads
  // the same selection.
  useEffect(() => {
    try { localStorage.setItem(COMPARE_KEY, JSON.stringify(compareList)); } catch {}
  }, [compareList]);

  const handleCompare = useCallback((b: Billboard) => {
    setCompareList(prev => {
      if (prev.some(x => x.id === b.id)) return prev.filter(x => x.id !== b.id);
      if (prev.length >= MAX_COMPARE) {
        setToast({ msg: `حداکثر ${MAX_COMPARE} رسانه را می‌توانید مقایسه کنید`, type: "error" });
        return prev;
      }
      setToast({ msg: `${b.name.substring(0, 22)}... به مقایسه اضافه شد`, type: "info" });
      return [...prev, b];
    });
  }, []);

  return (
    <>
      <div style={{
        padding: "16px 20px",
        display: view === "grid" ? "grid" : "flex",
        gridTemplateColumns: view === "grid" ? "repeat(auto-fill, minmax(320px, 1fr))" : undefined,
        flexDirection: view === "list" ? "column" : undefined,
        gap: view === "grid" ? 16 : 0,
      }}>
        {items.map(b => (
          <BillboardCard
            key={b.id}
            billboard={b}
            isSelected={false}
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
        onRemove={id => setCompareList(prev => prev.filter(b => b.id !== id))}
        onCompare={() => setShowCompareModal(true)}
        onClear={() => setCompareList([])}
      />
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
