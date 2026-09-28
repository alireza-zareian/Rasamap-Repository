"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchJson } from "@/lib/client/fetch-json";
import type { CurrentUser } from "@/lib/types";

export type { CurrentUser };

interface CurrentUserValue {
  /** undefined = still asking, null = nobody signed in. */
  user: CurrentUser | null | undefined;
  loading: boolean;
  logout: () => Promise<void>;
  /** Ask again after this tab signed in or out. */
  refresh: () => Promise<void>;
}

const Ctx = createContext<CurrentUserValue>({
  user: undefined,
  loading: true,
  logout: async () => {},
  refresh: async () => {},
});

/** Shared by the mount effect and refresh(), so the two cannot drift. */
async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    return (await fetchJson<{ user: CurrentUser }>("/api/auth/me")).user;
  } catch {
    // Signed out, offline or timed out: "signed out", not a loading state for ever.
    return null;
  }
}

/**
 * Who is signed in, asked once per page load and shared — several components
 * on every page need it, and each used to ask on its own.
 */
export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);

  useEffect(() => {
    // Only has to stop a setState after unmount; the request itself is cheap.
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
      // Leave anyway: a dead sign-out button is the worse failure. The session
      // row may survive on the server until it expires.
    }
    setUser(null);
    // A full reload, so no client state from the session is left for the next person.
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
