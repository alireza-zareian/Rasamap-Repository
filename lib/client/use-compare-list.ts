"use client";
import { useCallback, useEffect, useState } from "react";
import type { CatalogueItem } from "@/lib/types";

/**
 * The compare selection, shared by /explore and /compare through localStorage.
 * Nothing is written until the stored value has been read (`ready`), or a
 * reload would erase it. A stored item is checked for the fields the tray draws
 * — it may come from an older version of the site.
 */
const KEY = "rasamap_compare";

export const MAX_COMPARE = 2;

function isItem(v: unknown): v is CatalogueItem {
  const o = v as Partial<CatalogueItem> | null;
  return typeof o === "object" && o !== null
    && typeof o.id === "number" && typeof o.slug === "string"
    && typeof o.name === "string" && typeof o.price === "number";
}

function readStored(): CatalogueItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isItem).slice(0, MAX_COMPARE) : [];
  } catch {
    return [];
  }
}

export function useCompareList() {
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // After hydration, merge the stored list with anything ticked before this
    // ran — replacing it lost that tick (§37).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(picked => {
      const stored = readStored();
      return [...stored, ...picked.filter(p => !stored.some(s => s.id === p.id))].slice(0, MAX_COMPARE);
    });
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* private mode: the selection lives for this page only */ }
  }, [items, ready]);

  const remove = useCallback((id: number) => setItems(prev => prev.filter(b => b.id !== id)), []);
  const clear = useCallback(() => setItems([]), []);

  return { items, setItems, remove, clear, ready };
}
