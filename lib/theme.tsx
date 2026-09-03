"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Theme = "dark" | "light";
// Versioned on purpose. While the site defaulted to dark, every visit wrote
// "dark" here — including visits by people who never chose it. Changing the
// default to light therefore changed nothing on any device that had been to the
// site before: the stored value won. A new key retires all of those, so the new
// default is what everyone sees until they pick something themselves.
const KEY = "rasamap-theme-v2";
const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  // Hydrate from localStorage after mount (browser-only). The SSR default is
  // "light" (set on <html> in layout.tsx); this switches to "dark" only if the
  // visitor chose it on a previous visit.
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* private mode */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Persist only on a real toggle. Writing on every render is what made the old
  // default sticky in the first place.
  const toggle = () => setTheme(t => {
    const next = t === "dark" ? "light" : "dark";
    try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
    return next;
  });

  return (
    <Ctx.Provider value={{ theme, toggle }}>
      {children}
    </Ctx.Provider>
  );
}
export const useTheme = () => useContext(Ctx);
