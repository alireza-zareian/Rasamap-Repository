"use client";
import { useEffect, useSyncExternalStore } from "react";
import { safeNextPath } from "@/lib/client/next-path";

/**
 * The catalogue address the visitor last had on screen, filters and page
 * included, so "back to the results" from a media page returns to them rather
 * than to an empty /explore. Per tab (sessionStorage), like the history it stands in for.
 */
const KEY = "rasamap_last_search";
const CATALOGUE = "/explore";

/** Call from the catalogue with its current query string. */
export function useRememberSearch(query: string): void {
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, query ? `${CATALOGUE}?${query}` : CATALOGUE);
    } catch {
      // Storage unavailable: the link falls back to the bare catalogue.
    }
  }, [query]);
}

function readLastSearch(): string {
  try {
    // Checked on the way out as well: anything else in the slot is not a catalogue address.
    const stored = safeNextPath(sessionStorage.getItem(KEY));
    return stored && new URL(stored, "http://x").pathname === CATALOGUE ? stored : CATALOGUE;
  } catch {
    return CATALOGUE;
  }
}

const noSubscription = () => () => {};

/** The address to link back to; the bare catalogue in the server render. */
export function useLastSearchHref(): string {
  return useSyncExternalStore(noSubscription, readLastSearch, () => CATALOGUE);
}
