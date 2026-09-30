"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/client/use-current-user";
import { fetchJson, errorMessage } from "@/lib/client/fetch-json";
import Toast from "@/components/ui/Toast";

/**
 * A customer's saved media, shared by every heart on the page (§40). Asked for
 * once per page load, and only when a customer is signed in; each tap updates
 * the heart at once and the server after, putting it back if the server refuses.
 *
 * A guest's tap is remembered for this tab and sends them to sign in; back on
 * the page, the save is made for them. Staff accounts have no saved list.
 */

const PENDING_KEY = "rasamap_pending_save";

interface Pending { slug: string; name: string }

interface FavoritesValue {
  /** Hearts are shown: false for a staff session. */
  enabled: boolean;
  isSaved: (slug: string) => boolean;
  /** A request for this slug is on its way; its heart waits. */
  isBusy: (slug: string) => boolean;
  toggle: (slug: string, name: string) => void;
  count: number;
  /** The signed-in customer's list has arrived; before that, every heart reads empty. */
  loaded: boolean;
}

const Ctx = createContext<FavoritesValue>({
  enabled: false,
  isSaved: () => false,
  isBusy: () => false,
  toggle: () => {},
  count: 0,
  loaded: false,
});

function readPending(): Pending | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    const p = value as Partial<Pending> | null;
    return p && typeof p.slug === "string" && typeof p.name === "string" ? { slug: p.slug, name: p.name } : null;
  } catch {
    return null;
  }
}

const savePath = (slug: string) => `/api/favorites/${encodeURIComponent(slug)}`;
const shortName = (name: string) => (name.length > 28 ? `${name.slice(0, 28)}…` : name);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useCurrentUser();
  const router = useRouter();
  const customer = !!user && !user.isStaff;
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  // What a tap reads, so `toggle` keeps one identity instead of changing with every save.
  const savedRef = useRef(saved);
  useEffect(() => { savedRef.current = saved; }, [saved]);

  const mark = (set: typeof setSaved | typeof setBusy, slug: string, on: boolean) =>
    set(prev => {
      const next = new Set(prev);
      if (on) next.add(slug); else next.delete(slug);
      return next;
    });

  // Load the list when a customer is known; forget it when they sign out.
  useEffect(() => {
    if (!customer) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSaved(new Set());
      setLoaded(false);
      return;
    }
    let active = true;
    (async () => {
      let slugs: string[] = [];
      try {
        slugs = (await fetchJson<{ slugs: string[] }>("/api/favorites")).slugs;
      } catch {
        // The hearts stay empty; a tap will still save and report its own error.
      }
      if (!active) return;
      setSaved(new Set(slugs));
      setLoaded(true);

      // A heart tapped before signing in.
      const pending = readPending();
      if (pending && !slugs.includes(pending.slug)) {
        try {
          await fetchJson(savePath(pending.slug), { method: "PUT" });
          if (!active) return;
          setSaved(prev => new Set(prev).add(pending.slug));
          setToast({ msg: `«${shortName(pending.name)}» در ذخیره‌شده‌ها قرار گرفت`, type: "success" });
        } catch (err) {
          if (active) setToast({ msg: errorMessage(err), type: "error" });
        }
      }
    })();
    return () => { active = false; };
  }, [customer]);

  // A tap made while the page is still asking who this is. It used to be
  // dropped, so a guest's first tap on a slow connection did nothing at all
  // (the e2e heart test failed the same way, four runs in five); it is acted on
  // when the answer comes. The heart it was drawn on was empty, so it saves.
  const earlyTap = useRef<{ slug: string; name: string } | null>(null);

  const toggle = useCallback((slug: string, name: string) => {
    if (user === undefined) { earlyTap.current = { slug, name }; return; }
    if (user === null) {
      try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ slug, name })); } catch { /* the sign-in still helps */ }
      const here = window.location.pathname + window.location.search;
      router.push(`/login?next=${encodeURIComponent(here)}`);
      return;
    }
    if (user.isStaff) return;

    const wasSaved = savedRef.current.has(slug);
    mark(setSaved, slug, !wasSaved);
    mark(setBusy, slug, true);
    fetchJson(savePath(slug), { method: wasSaved ? "DELETE" : "PUT" })
      .then(() => setToast(wasSaved
        ? { msg: "از ذخیره‌شده‌ها برداشته شد", type: "info" }
        : { msg: `«${shortName(name)}» ذخیره شد`, type: "success" }))
      .catch(err => {
        mark(setSaved, slug, wasSaved);
        setToast({ msg: errorMessage(err), type: "error" });
      })
      .finally(() => mark(setBusy, slug, false));
  }, [user, router]);

  useEffect(() => {
    if (user === undefined || !earlyTap.current) return;
    const { slug, name } = earlyTap.current;
    earlyTap.current = null;
    toggle(slug, name);
  }, [user, toggle]);

  const value: FavoritesValue = {
    enabled: !user?.isStaff,
    isSaved: slug => saved.has(slug),
    isBusy: slug => busy.has(slug),
    toggle,
    count: saved.size,
    loaded,
  };

  const closeToast = useCallback(() => setToast(null), []);

  return (
    <Ctx.Provider value={value}>
      {children}
      {toast && <Toast message={toast.msg} type={toast.type} onClose={closeToast} />}
    </Ctx.Provider>
  );
}

export function useFavorites(): FavoritesValue {
  return useContext(Ctx);
}
