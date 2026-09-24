"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Theme = "dark" | "light";
// Versioned on purpose. While the site defaulted to dark, every visit wrote
// "dark" here — including visits by people who never chose it. Changing the
// default to light therefore changed nothing on any device that had been to the
// site before: the stored value won. A new key retires all of those, so the new
// default is what everyone sees until they pick something themselves.
export const THEME_STORAGE_KEY = "rasamap-theme-v2";
const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  // Catch up with the theme the pre-paint script in layout.tsx already applied.
  // That script — not this effect — is what puts the right theme on screen; by
  // the time React mounts, <html data-theme> is already correct. Reading the
  // attribute rather than localStorage means there is one parser of the stored
  // value, and this provider simply follows what the document is showing.
  useEffect(() => {
    const applied = document.documentElement.getAttribute("data-theme");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (applied === "light" || applied === "dark") setTheme(applied);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    // The inline style on <html> is what layout.tsx sets for the SSR default;
    // keep it in step so the browser's own form controls and scrollbars follow
    // the theme instead of staying light under a dark page.
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  // Persist only on a real toggle. Writing on every render is what made the old
  // default sticky in the first place.
  const toggle = () => setTheme(t => {
    const next = t === "dark" ? "light" : "dark";
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* private mode */ }
    return next;
  });

  return (
    <Ctx.Provider value={{ theme, toggle }}>
      {children}
    </Ctx.Provider>
  );
}
export const useTheme = () => useContext(Ctx);
