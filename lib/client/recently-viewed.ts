"use client";
import { useSyncExternalStore } from "react";

/**
 * The media pages this browser opened last, newest first — kept in
 * localStorage only, never sent anywhere, so a guest has it too and nothing
 * about it reaches the server. Read through useSyncExternalStore: the server
 * renders the empty list and the browser fills it in after hydration, with no
 * mismatch. A stored entry is checked field by field (an older version of the
 * site, or a hand edit, may have left anything there).
 */
export interface ViewedMedia {
  slug: string;
  name: string;
  city: string;
  type: string;
  /** Millions of toman a month, as stored. */
  price: number;
  image?: string;
}

const KEY = "rasamap_recent_v1";
/** Enough for "the ones I was comparing yesterday", short enough to scan. */
const MAX_RECENT = 12;
/** Same-tab writes; `storage` only reports other tabs. */
const CHANGED = "rasamap:recent";
const EMPTY: ViewedMedia[] = [];

function isViewed(v: unknown): v is ViewedMedia {
  const o = v as Partial<ViewedMedia> | null;
  return typeof o === "object" && o !== null
    && typeof o.slug === "string" && typeof o.name === "string" && typeof o.city === "string"
    && typeof o.type === "string" && typeof o.price === "number"
    && (o.image === undefined || typeof o.image === "string");
}

// useSyncExternalStore wants the same array back while nothing changed.
let snapshot: { raw: string | null; list: ViewedMedia[] } = { raw: null, list: EMPTY };

function read(): ViewedMedia[] {
  let raw: string | null;
  try { raw = localStorage.getItem(KEY); } catch { return EMPTY; }
  if (raw === snapshot.raw) return snapshot.list;
  let list = EMPTY;
  try {
    const value: unknown = raw ? JSON.parse(raw) : [];
    list = Array.isArray(value) ? value.filter(isViewed).slice(0, MAX_RECENT) : EMPTY;
  } catch { /* unreadable: start over */ }
  snapshot = { raw, list };
  return list;
}

function write(list: ViewedMedia[]) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch { return; /* private mode: nothing is remembered */ }
  window.dispatchEvent(new Event(CHANGED));
}

export function rememberViewed(item: ViewedMedia): void {
  write([item, ...read().filter(x => x.slug !== item.slug)].slice(0, MAX_RECENT));
}

export function forgetViewed(): void {
  write([]);
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

export function useRecentlyViewed(): ViewedMedia[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
