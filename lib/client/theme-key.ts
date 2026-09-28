/**
 * Where the chosen theme is stored. Its own module, without "use client": the
 * root layout, a Server Component, writes it into the pre-paint script, and a
 * plain value imported from a client module arrives there as undefined — the
 * script read localStorage.getItem(undefined), so a dark theme was forgotten on
 * every page load.
 *
 * Versioned: the old key was written on every visit, choice or not, so it would
 * have kept the old dark default on every returning device.
 */
export const THEME_STORAGE_KEY = "rasamap-theme-v2";
