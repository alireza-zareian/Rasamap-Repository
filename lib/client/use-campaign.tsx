"use client";
import { createContext, useCallback, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { CatalogueItem } from "@/lib/types";
import { MAX_PICKED } from "@/lib/domain/campaign";

/**
 * The media picked for a campaign (§40): one list per page, shared by the tray
 * on the catalogue, the button on a media page, the tab bar's count and
 * /campaign, and kept in localStorage between visits. The stored items are
 * snapshots for the tray; /campaign renders from the server.
 *
 * Nothing is written until the stored value has been read (`ready`), or a
 * reload would erase it. A stored item is checked for the fields the tray
 * draws — it may come from an older version of the site. Another tab's change
 * arrives through the `storage` event, so two open pages agree.
 */
const KEY = "rasamap_compare"; // the name from when this was a two-item compare; kept so no one's pick is lost

export { MAX_PICKED };

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
    return Array.isArray(value) ? value.filter(isItem).slice(0, MAX_PICKED) : [];
  } catch {
    return [];
  }
}

interface CampaignValue {
  items: CatalogueItem[];
  setItems: Dispatch<SetStateAction<CatalogueItem[]>>;
  remove: (id: number) => void;
  clear: () => void;
  /** The stored list has been read; before that, `items` is only what this page picked. */
  ready: boolean;
}

const Ctx = createContext<CampaignValue>({
  items: [], setItems: () => {}, remove: () => {}, clear: () => {}, ready: false,
});

export function CampaignProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // After hydration, merge the stored list with anything picked before this
    // ran — replacing it lost that pick (§37).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(picked => {
      const stored = readStored();
      return [...stored, ...picked.filter(p => !stored.some(s => s.id === p.id))].slice(0, MAX_PICKED);
    });
    setReady(true);

    const onStorage = (e: StorageEvent) => { if (e.key === KEY) setItems(readStored()); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* private mode: the pick lives for this page only */ }
  }, [items, ready]);

  const remove = useCallback((id: number) => setItems(prev => prev.filter(b => b.id !== id)), []);
  const clear = useCallback(() => setItems([]), []);

  return <Ctx.Provider value={{ items, setItems, remove, clear, ready }}>{children}</Ctx.Provider>;
}

export function useCampaign(): CampaignValue {
  return useContext(Ctx);
}
