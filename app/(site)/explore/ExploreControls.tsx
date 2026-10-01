"use client";
import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRememberSearch } from "@/lib/client/last-search";
import { Search, X, LayoutGrid, List, SlidersHorizontal, RotateCcw, Megaphone, Monitor, Milestone, Train, MapPin, ChevronDown, Crosshair } from "lucide-react";
import { AVAILABILITIES, availabilityLabels, type BillboardType } from "@/lib/types";
import { provinces, getProvince } from "@/lib/geo/iran-cities";
import { faNum } from "@/lib/format";
import {
  type ExploreFilters, type SortKey, ALLOWED_SORT,
  MIN_PRICE, MAX_PRICE, exploreHref, hasActiveFilters,
} from "@/lib/explore-query";
import styles from "./explore.module.css";

/**
 * The catalogue's controls. They hold no filter state: each reads `filters`
 * and writes a new address, and the server renders the page. The search box
 * and price slider echo at once and navigate once input settles. Navigation is
 * a transition, so the current results stay up while the next page is built.
 */

const TYPE_CHIPS: { label: string; value: BillboardType | "all"; Icon?: React.ComponentType<{ size?: number }> }[] = [
  { label: "همه", value: "all" },
  { label: "بیلبورد", value: "billboard", Icon: Megaphone },
  { label: "دیجیتال", value: "digital", Icon: Monitor },
  { label: "عرشه پل", value: "bridge", Icon: Milestone },
  { label: "ایستگاه", value: "station", Icon: Train },
];

/** The radii offered in the control. Every one is inside MAX_RADIUS_KM. */
const RADIUS_CHOICES = [1, 2, 5, 10, 20, 50];

const SORT_LABELS: Record<SortKey, string> = {
  price_asc:    "قیمت: کم به زیاد",
  price_desc:   "قیمت: زیاد به کم",
  traffic_desc: "بیشترین بازدید",
  area_desc:    "بزرگترین سطح",
};

/** How long the search box waits after the last keystroke before navigating. */
const SEARCH_DEBOUNCE_MS = 350;

const SORTED_PROVINCES = [...provinces].sort((a, b) => a.name.localeCompare(b.name, "fa"));

/**
 * Write a filter change to the URL; any change but paging returns to page one.
 * `replace` rewrites the current history entry instead of adding one.
 */
function useFilterNavigation(filters: ExploreFilters) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const apply = useCallback((patch: Partial<ExploreFilters>, { replace = false } = {}) => {
    const href = exploreHref({ ...filters, page: 1, ...patch });
    startTransition(() => (replace ? router.replace : router.push)(href, { scroll: false }));
  }, [filters, router]);
  return { apply, pending };
}

/**
 * Whether `value` is one of ours landing: if so, drop the entries older than it
 * (they will not land after it matters) and say yes.
 */
function landed<T>(queue: T[], value: T): boolean {
  const i = queue.lastIndexOf(value);
  if (i < 0) return false;
  queue.splice(0, i);
  return true;
}

/**
 * `heading` names the view («بیلبورد در مشهد»), as its title does; the count
 * lives once, in the results bar under it.
 */
export function ExploreControls({ filters, heading }: { filters: ExploreFilters; heading: string }) {
  const { apply, pending } = useFilterNavigation(filters);
  useRememberSearch(useSearchParams().toString());
  const [showMore, setShowMore] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  // How many filters the phone's fold is hiding right now — not
  // hasActiveFilters, which also counts the search box and the slider.
  const folded = [filters.province, filters.city, filters.type !== "all" ? filters.type : "", filters.availability].filter(Boolean).length;

  // The search box is uncontrolled: the browser owns what is typed. As a
  // controlled input, a key that arrived while a navigation was being applied
  // never reached onChange, and the re-render then wrote the old value over it
  // — a space or the last letters vanished mid-word (test/e2e.test.mjs, "keeps
  // every keystroke"). It listens with a native listener, not onChange or
  // onInput: a key typed while React applied a navigation reached neither (one
  // run in eight lost the last letter with onInput). Only whether it is empty is
  // state, for the clear button.
  const searchRef = useRef<HTMLInputElement>(null);
  const [hasText, setHasText] = useState(filters.search !== "");
  const [price, setPrice] = useState(filters.maxPrice);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // What these two fields have sent to the URL and not yet seen arrive, oldest
  // first. A URL value in that queue is our own navigation landing, and the
  // field may already hold more: copying it back erased what was typed while
  // the request was out («تهران ونک» ended as «تهرانک» at 700 ms per
  // navigation). An older one can land after a newer one was sent, so the whole
  // queue counts, not only the last entry. Any other value came from outside
  // (back button, reset link) and replaces the field.
  const inFlight = useRef({ search: [filters.search], maxPrice: [filters.maxPrice] });
  useEffect(() => {
    if (landed(inFlight.current.search, filters.search)) return;
    inFlight.current.search = [filters.search];
    if (searchRef.current) searchRef.current.value = filters.search;
    setHasText(filters.search !== "");
  }, [filters.search]);
  useEffect(() => {
    if (landed(inFlight.current.maxPrice, filters.maxPrice)) return;
    inFlight.current.maxPrice = [filters.maxPrice];
    setPrice(filters.maxPrice);
  }, [filters.maxPrice]);
  const send = useCallback((patch: Partial<ExploreFilters>, options?: { replace?: boolean }) => {
    // The field, not the last onChange, is what the visitor typed.
    if (patch.search !== undefined && searchRef.current) patch = { ...patch, search: searchRef.current.value };
    if (patch.search !== undefined) inFlight.current.search.push(patch.search);
    if (patch.maxPrice !== undefined) inFlight.current.maxPrice.push(patch.maxPrice);
    apply(patch, options);
  }, [apply]);

  // The field whose typing produced the current history entry. Every pause in
  // typing navigates, and each used to push: three pauses on «ونک» left Back
  // on «ون». The first pause of a burst pushes, the rest replace it, so Back
  // leaves the search in one step.
  const typingRef = useRef<keyof ExploreFilters | null>(null);
  // Typing not yet sent. A click meanwhile carries it along rather than
  // navigating without it and then being overtaken by the timer.
  const unsentRef = useRef<Partial<ExploreFilters>>({});
  const applyNow = useCallback((patch: Partial<ExploreFilters>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    typingRef.current = null;
    send({ ...unsentRef.current, ...patch });
    unsentRef.current = {};
  }, [send]);
  const applyDebounced = useCallback((field: "search" | "maxPrice", patch: Partial<ExploreFilters>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    unsentRef.current = { ...unsentRef.current, ...patch };
    debounceRef.current = setTimeout(() => {
      send(unsentRef.current, { replace: typingRef.current === field });
      unsentRef.current = {};
      typingRef.current = field;
    }, SEARCH_DEBOUNCE_MS);
  }, [send]);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);
  useEffect(() => {
    const field = searchRef.current;
    if (!field) return;
    const onInput = () => { setHasText(field.value !== ""); applyDebounced("search", { search: field.value }); };
    field.addEventListener("input", onInput);
    return () => field.removeEventListener("input", onInput);
  }, [applyDebounced]);

  const cities = filters.province ? (getProvince(filters.province)?.cities ?? []) : [];

  return (
    <div className={styles.controls}>
      <div className={styles.controlsHead}>
        <h1 className={styles.title}>{heading}</h1>
        <div className={styles.views}>
          {(["grid", "list"] as const).map(m => (
            <button key={m} type="button" className={styles.viewButton} aria-pressed={filters.view === m}
              onClick={() => applyNow({ view: m, page: filters.page })} aria-label={m === "grid" ? "نمایش شبکه‌ای" : "نمایش فهرستی"}>
              {m === "grid" ? <LayoutGrid size={15} /> : <List size={15} />}
            </button>
          ))}
        </div>
      </div>

      <div className={`${styles.searchBox} gradient-frame`}>
        <Search size={16} />
        <input
          className={styles.searchInput}
          ref={searchRef}
          defaultValue={filters.search}
          placeholder="جستجو — نام، منطقه، خیابان، شهر…"
          aria-label="جستجو"
          enterKeyHint="search"
        />
        {hasText && (
          <button type="button" className={styles.bare} onClick={() => {
            if (searchRef.current) searchRef.current.value = "";
            setHasText(false);
            applyNow({ search: "" });
          }} aria-label="پاک کردن جستجو">
            <X size={15} />
          </button>
        )}
      </div>

      <button type="button" className={`${styles.locToggle} ${folded ? styles.locActive : ""}`}
        onClick={() => setLocOpen(o => !o)} aria-expanded={locOpen}>
        <MapPin size={15} />
        <span>فیلتر مکان و نوع رسانه</span>
        {folded > 0 && <span className={styles.count}>{faNum(folded)}</span>}
        <ChevronDown size={15} className={styles.chevron} />
      </button>

      <div className={locOpen ? styles.secondaryOpen : styles.secondary}>
        <div className={styles.pair}>
          <select className={styles.select} value={filters.province} onChange={e => applyNow({ province: e.target.value, city: "" })} aria-label="استان">
            <option value="">همه استان‌ها</option>
            {SORTED_PROVINCES.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          <select className={styles.select} value={filters.city} onChange={e => applyNow({ city: e.target.value })} disabled={!filters.province} aria-label="شهر">
            <option value="">{filters.province ? "همه شهرها" : "ابتدا استان انتخاب کنید"}</option>
            {cities.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </div>

        <div className={styles.chips}>
          {TYPE_CHIPS.map(c => (
            <button key={c.value} type="button" className={styles.chip} aria-pressed={filters.type === c.value} onClick={() => applyNow({ type: c.value })}>
              {c.Icon && <c.Icon size={12} />}
              {c.label}
            </button>
          ))}

          {/* A radial search starts from a media page; here it becomes visible and adjustable. */}
          {filters.near && (
            <div className={styles.near}>
              <Crosshair size={13} />
              <span>تا {faNum(filters.near.radiusKm)} کیلومتر از این نقطه</span>
              <select value={filters.near.radiusKm} aria-label="شعاع جست‌وجو به کیلومتر"
                onChange={e => applyNow({ near: { ...filters.near!, radiusKm: Number(e.target.value) } })}>
                {RADIUS_CHOICES.map(km => <option key={km} value={km}>{faNum(km)} کیلومتر</option>)}
              </select>
              <button type="button" className={styles.bare} onClick={() => applyNow({ near: null })} aria-label="برداشتن محدودهٔ مکانی">
                <X size={13} />
              </button>
            </div>
          )}

          <button type="button" className={`${styles.chip} ${styles.more}`} aria-pressed={showMore} aria-expanded={showMore} onClick={() => setShowMore(p => !p)}>
            <SlidersHorizontal size={13} /> فیلترهای بیشتر
            {hasActiveFilters(filters) && <span className={styles.dot} />}
          </button>
        </div>

        {showMore && (
          <div className={styles.extra}>
            <div>
              <label htmlFor="explore-availability" className={styles.label}>وضعیت</label>
              <select id="explore-availability" className={styles.select} value={filters.availability}
                onChange={e => applyNow({ availability: e.target.value as ExploreFilters["availability"] })}>
                <option value="">همه وضعیت‌ها</option>
                {AVAILABILITIES.map(a => <option key={a} value={a}>{availabilityLabels[a]}</option>)}
              </select>
            </div>
            <div>
              <div className={styles.priceRow}>
                <label htmlFor="explore-price" className={styles.label}>حداکثر قیمت</label>
                <span className={styles.priceValue}>{faNum(price)}M تومان/ماه</span>
              </div>
              <input id="explore-price" className={styles.range} type="range" min={MIN_PRICE} max={MAX_PRICE} step={10} value={price}
                onChange={e => { setPrice(+e.target.value); applyDebounced("maxPrice", { maxPrice: +e.target.value }); }} />
            </div>
            {hasActiveFilters(filters) && (
              <div>
                <button type="button" className={styles.chip}
                  onClick={() => applyNow({ search: "", type: "all", availability: "", province: "", city: "", maxPrice: MAX_PRICE, near: null })}>
                  <RotateCcw size={13} /> پاک کردن همهٔ فیلترها
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {pending && <div className={styles.pending} role="status">در حال جستجو…</div>}
    </div>
  );
}

/** The sort dropdown in the sticky results header. */
export function SortSelect({ filters }: { filters: ExploreFilters }) {
  const { apply, pending } = useFilterNavigation(filters);
  return (
    <select className={styles.sort} value={filters.sortBy} disabled={pending} aria-label="ترتیب نمایش"
      onChange={e => apply({ sortBy: e.target.value as SortKey })}>
      {ALLOWED_SORT.map(k => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
    </select>
  );
}
