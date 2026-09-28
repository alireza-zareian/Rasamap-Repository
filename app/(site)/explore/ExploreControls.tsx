"use client";
import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
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

/** Push a filter change to the URL; any change but paging returns to page one. */
function useFilterNavigation(filters: ExploreFilters) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const apply = useCallback((patch: Partial<ExploreFilters>) => {
    startTransition(() => router.push(exploreHref({ ...filters, page: 1, ...patch }), { scroll: false }));
  }, [filters, router]);
  return { apply, pending };
}

export function ExploreControls({ filters, total }: { filters: ExploreFilters; total: number }) {
  const { apply, pending } = useFilterNavigation(filters);
  const [showMore, setShowMore] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  // How many filters the phone's fold is hiding right now — not
  // hasActiveFilters, which also counts the search box and the slider.
  const folded = [filters.province, filters.city, filters.type !== "all" ? filters.type : "", filters.availability].filter(Boolean).length;

  const [text, setText] = useState(filters.search);
  const [price, setPrice] = useState(filters.maxPrice);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The URL can change without these inputs (back button, reset link).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { setText(filters.search); }, [filters.search]);
  useEffect(() => { setPrice(filters.maxPrice); }, [filters.maxPrice]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const applyDebounced = useCallback((patch: Partial<ExploreFilters>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => apply(patch), SEARCH_DEBOUNCE_MS);
  }, [apply]);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const cities = filters.province ? (getProvince(filters.province)?.cities ?? []) : [];

  return (
    <div className={styles.controls}>
      <div className={styles.controlsHead}>
        <div>
          <h1 className={styles.title}>جستجوی رسانهٔ تبلیغاتی</h1>
          <div className={styles.subtitle}>{total > 0 ? `${faNum(total)} رسانه یافت شد` : "جستجو در پایگاه دادهٔ رسانه‌های ایران"}</div>
        </div>
        <div className={styles.views}>
          {(["grid", "list"] as const).map(m => (
            <button key={m} type="button" className={styles.viewButton} aria-pressed={filters.view === m}
              onClick={() => apply({ view: m, page: filters.page })} aria-label={m === "grid" ? "نمایش شبکه‌ای" : "نمایش فهرستی"}>
              {m === "grid" ? <LayoutGrid size={15} /> : <List size={15} />}
            </button>
          ))}
        </div>
      </div>

      <div className={`${styles.searchBox} gradient-frame`}>
        <Search size={16} />
        <input
          className={styles.searchInput}
          value={text}
          onChange={e => { setText(e.target.value); applyDebounced({ search: e.target.value }); }}
          placeholder="جستجو — نام، منطقه، خیابان، شهر…"
          aria-label="جستجو"
          enterKeyHint="search"
        />
        {text && (
          <button type="button" className={styles.bare} onClick={() => { setText(""); apply({ search: "" }); }} aria-label="پاک کردن جستجو">
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
          <select className={styles.select} value={filters.province} onChange={e => apply({ province: e.target.value, city: "" })} aria-label="استان">
            <option value="">همه استان‌ها</option>
            {SORTED_PROVINCES.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          <select className={styles.select} value={filters.city} onChange={e => apply({ city: e.target.value })} disabled={!filters.province} aria-label="شهر">
            <option value="">{filters.province ? "همه شهرها" : "ابتدا استان انتخاب کنید"}</option>
            {cities.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </div>

        <div className={styles.chips}>
          {TYPE_CHIPS.map(c => (
            <button key={c.value} type="button" className={styles.chip} aria-pressed={filters.type === c.value} onClick={() => apply({ type: c.value })}>
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
                onChange={e => apply({ near: { ...filters.near!, radiusKm: Number(e.target.value) } })}>
                {RADIUS_CHOICES.map(km => <option key={km} value={km}>{faNum(km)} کیلومتر</option>)}
              </select>
              <button type="button" className={styles.bare} onClick={() => apply({ near: null })} aria-label="برداشتن محدودهٔ مکانی">
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
                onChange={e => apply({ availability: e.target.value as ExploreFilters["availability"] })}>
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
                onChange={e => { setPrice(+e.target.value); applyDebounced({ maxPrice: +e.target.value }); }} />
            </div>
            {hasActiveFilters(filters) && (
              <div>
                <button type="button" className={styles.chip}
                  onClick={() => apply({ search: "", type: "all", availability: "", province: "", city: "", maxPrice: MAX_PRICE, near: null })}>
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
