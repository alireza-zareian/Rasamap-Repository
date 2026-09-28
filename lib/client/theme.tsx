"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Theme = "dark" | "light";
// Versioned: the old key was written on every visit, choice or not, so it
// would have kept the old dark default on every returning device.
export const THEME_STORAGE_KEY = "rasamap-theme-v2";
const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  // Follow what the pre-paint script in layout.tsx already applied, so the
  // stored value has one parser.
  useEffect(() => {
    const applied = document.documentElement.getAttribute("data-theme");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (applied === "light" || applied === "dark") setTheme(applied);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    // So native form controls and scrollbars follow the theme too.
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  // Stored only on a real toggle.
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
