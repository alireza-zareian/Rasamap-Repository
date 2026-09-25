"use client";
import { useCallback, useEffect, useState } from "react";
import type { CatalogueItem } from "@/lib/types";

/**
 * The visitor's compare selection, shared by /explore and /compare through
 * localStorage.
 *
 * It is read before it is ever written. /explore used to start from an empty
 * list and save it on mount, so opening the catalogue — a reload, or coming
 * back from /compare — erased the selection the visitor had just made. The
 * write now waits until the stored value has been read (`ready`).
 *
 * What comes back from storage is another page's snapshot, possibly from an
 * older version of the site, so it is checked for the fields the tray draws
 * and dropped if it does not have them, rather than crashing the page.
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
    // Storage exists only in the browser, so the server render starts empty and
    // this fills it once, after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(readStored());
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
