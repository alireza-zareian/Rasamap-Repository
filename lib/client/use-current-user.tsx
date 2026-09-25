"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchJson } from "@/lib/client/fetch-json";

export interface CurrentUser {
  id: number;
  name: string;
  phone: string;
  /** A member of the team rather than a customer — see GET /api/auth/me. */
  isStaff?: boolean;
  role?: string;
}

interface CurrentUserValue {
  /** undefined = still asking, null = nobody signed in. */
  user: CurrentUser | null | undefined;
  loading: boolean;
  logout: () => Promise<void>;
  /** Re-ask after something changed the session on this tab — see the note on
   *  CurrentUserProvider about why signing in needs this. */
  refresh: () => Promise<void>;
}

const Ctx = createContext<CurrentUserValue>({
  user: undefined,
  loading: true,
  logout: async () => {},
  refresh: async () => {},
});

/**
 * Who is signed in — asked once per page load, not once per component.
 *
 * This used to be a plain hook with its own `fetch` inside, which meant every
 * component that wanted the answer asked separately and none of them shared.
 * Three of them mount together on a media page (StaffBar sits in the root
 * layout, so it is on *every* page, plus Topbar and BillboardContact), so an
 * ordinary visit spent three requests establishing one fact. Two on the
 * landing page, two on the catalogue.
 *
 * None of them were expensive — the session is a JWT and no query runs — but
 * they are three round-trips a phone on a slow connection waits through, three
 * passes through proxy.ts, and three times the rate-limit accounting, to learn
 * something that cannot change between them.
 *
 * A provider in the root layout asks once and hands the answer to everyone.
 */
/** The request itself, kept out of the component so the mount effect and the
 *  imperative refresh below cannot drift apart. */
async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    return (await fetchJson<{ user: CurrentUser }>("/api/auth/me")).user;
  } catch {
    // Signed out (401), offline, or no answer within fetchJson's timeout: answer
    // "signed out" rather than leaving every consumer stuck on the loading
    // state. A bare fetch had no timeout, so a stalled request did exactly that.
    return null;
  }
}

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);

  useEffect(() => {
    // `cancelled` rather than an AbortController: the answer is cheap and
    // already in flight, and all this needs to prevent is a setState landing
    // after the provider has gone.
    let cancelled = false;
    fetchCurrentUser().then((u) => {
      if (!cancelled) setUser(u);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setUser(await fetchCurrentUser());
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetchJson("/api/auth/logout", { method: "POST" });
    } catch {
      // Leaving is not negotiable. If the server cannot be reached the cookie
      // may survive on it, but keeping someone on a page they asked to leave —
      // or worse, leaving the button dead because a hung request never
      // returned — is the worse failure. The reload below drops every trace of
      // the session from this browser either way.
    }
    setUser(null);
    // A full reload rather than a soft navigation, and deliberately so: it
    // discards every piece of client state built up while signed in — open
    // modals, a half-filled listing form, a compare selection — instead of
    // leaving some of it behind for the next person at this browser.
    window.location.href = "/";
  }, []);

  return (
    <Ctx.Provider value={{ user, loading: user === undefined, logout, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCurrentUser(): CurrentUserValue {
  return useContext(Ctx);
}
