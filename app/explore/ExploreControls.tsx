"use client";
import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, LayoutGrid, List, SlidersHorizontal, RotateCcw, Megaphone, Monitor, Milestone, Train, MapPin, ChevronDown, Crosshair } from "lucide-react";
import type { BillboardType } from "@/lib/types";
import { provinces, getProvince } from "@/lib/iranLocations";
import { faNum } from "@/lib/format";
import {
  type ExploreFilters, type SortKey, ALLOWED_SORT,
  MIN_PRICE, MAX_PRICE, exploreHref, hasActiveFilters,
} from "@/lib/explore-query";

/**
 * The catalogue's interactive controls.
 *
 * The only client code left on /explore: the results themselves are rendered on
 * the server. Nothing here holds a copy of the filter state — every control
 * reads the `filters` prop and writes a new address, and the server sends back
 * a new page. The one exception is the search box, which needs to echo
 * keystrokes faster than a round-trip and so keeps the text locally until the
 * debounce fires.
 *
 * Navigation goes through a transition, so the current results stay on screen
 * (dimmed) while the next page is being built instead of collapsing into the
 * route's loading screen on every keystroke.
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

/**
 * Push a filter change to the URL.
 *
 * Any change except paging returns to page one: staying on page 7 of a result
 * set that just shrank to two pages shows an empty catalogue for no reason.
 */
function useFilterNavigation(filters: ExploreFilters) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const apply = useCallback((patch: Partial<ExploreFilters>) => {
    const next = { page: 1, ...patch };
    startTransition(() => router.push(exploreHref({ ...filters, ...next }), { scroll: false }));
  }, [filters, router]);

  return { apply, pending };
}

export function ExploreControls({ filters, total }: { filters: ExploreFilters; total: number }) {
  const { apply, pending } = useFilterNavigation(filters);
  const [showFilters, setShowFilters] = useState(false);
  // On a phone the location/type controls sit between the search box and the
  // first result; collapsed by default they stop pushing the catalogue off
  // screen. Desktop ignores this — the media query below keeps the body open.
  const [locOpen, setLocOpen] = useState(false);
  // Deliberately not `hasActiveFilters`: that answers "is anything filtered at
  // all" and counts the search box and the price slider, which stay visible.
  // The badge has to answer a narrower question — how many filters are hidden
  // behind this toggle right now — so it counts only what the fold covers.
  const activeCount = [filters.province, filters.city, filters.type !== "all" ? filters.type : "",
    filters.status].filter(Boolean).length;

  // The search box and the price slider are continuous inputs: they echo the
  // user immediately and navigate once the input settles. Everything else is a
  // discrete choice and navigates on the spot.
  const [text, setText] = useState(filters.search);
  const [price, setPrice] = useState(filters.maxPrice);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The URL is the source of truth, and it can change without passing through
  // these inputs — the back button, or the reset link below.
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
  const sortedProvinces = [...provinces].sort((a, b) => a.name.localeCompare(b.name, "fa"));

  return (
    <div style={{
      background: "linear-gradient(180deg, var(--bg-card) 0%, var(--bg-deep) 100%)",
      borderLeft: "1px solid var(--border)",
      padding: "20px 24px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-main)" }}>
            جستجوی رسانه تبلیغاتی
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
            {total > 0 ? `${faNum(total)} رسانه یافت شد` : "جستجو در پایگاه داده رسانه‌های ایران"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, background: "var(--bg-surface)", borderRadius: 8, padding: 3 }}>
          {(["grid", "list"] as const).map(m => (
            <button
              key={m}
              onClick={() => apply({ view: m, page: filters.page })}
              aria-label={m === "grid" ? "نمایش شبکه‌ای" : "نمایش فهرستی"}
              style={{
                width: 30, height: 30, borderRadius: 6, border: "none", cursor: "pointer",
                background: filters.view === m ? "var(--accent)" : "none",
                color: filters.view === m ? "#fff" : "var(--text-muted)",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}
            >
              {m === "grid" ? <LayoutGrid size={15} /> : <List size={15} />}
            </button>
          ))}
        </div>
      </div>

      {/* Search input */}
      <div className="gradient-frame" style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "var(--bg-surface)", border: "1px solid var(--border)",
        borderRadius: 10, padding: "10px 14px", marginBottom: 12,
      }}>
        <Search size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <input
          value={text}
          onChange={e => { setText(e.target.value); applyDebounced({ search: e.target.value }); }}
          placeholder="جستجو — نام، منطقه، خیابان، شهر..."
          style={{
            background: "none", border: "none", flex: 1, fontFamily: "inherit",
            fontSize: "0.9rem", color: "var(--text-main)", outline: "none",
          }}
        />
        {text && (
          <button
            onClick={() => { setText(""); apply({ search: "" }); }}
            aria-label="پاک کردن جستجو"
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex" }}
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Mobile-only: fold the location/type controls behind one tap so the
          results start higher up the page. Hidden on desktop by the media query. */}
      <button
        className="explore-loc-toggle"
        onClick={() => setLocOpen(o => !o)}
        aria-expanded={locOpen}
        style={{
          display: "none", width: "100%", alignItems: "center", gap: 8, marginBottom: 12,
          padding: "10px 14px", borderRadius: 10, fontFamily: "inherit", fontSize: "0.85rem",
          border: `1px solid ${locOpen || activeCount ? "var(--accent)" : "var(--border)"}`,
          background: locOpen || activeCount ? "rgba(59,123,245,0.08)" : "var(--bg-surface)",
          color: locOpen || activeCount ? "var(--accent)" : "var(--text-muted)", cursor: "pointer",
        }}
      >
        <MapPin size={15} />
        <span style={{ flex: 1, textAlign: "right" }}>فیلتر مکان و نوع رسانه</span>
        {activeCount > 0 && (
          <span style={{ fontSize: "0.72rem", fontWeight: 700, background: "var(--accent)", color: "#fff", borderRadius: 20, padding: "1px 8px" }}>{faNum(activeCount)}</span>
        )}
        <ChevronDown size={15} style={{ transform: locOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      <div className={`explore-secondary${locOpen ? " is-open" : ""}`}>
        {/* Province + City */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          <select
            value={filters.province}
            onChange={e => apply({ province: e.target.value, city: "" })}
            aria-label="استان"
            style={selectStyle}
          >
            <option value="">همه استان‌ها</option>
            {sortedProvinces.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          <select
            value={filters.city}
            onChange={e => apply({ city: e.target.value })}
            disabled={!filters.province}
            aria-label="شهر"
            style={{ ...selectStyle, opacity: filters.province ? 1 : 0.5, cursor: filters.province ? "pointer" : "not-allowed" }}
          >
            <option value="">{filters.province ? "همه شهرها" : "ابتدا استان انتخاب کنید"}</option>
            {cities.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </div>

        {/* Type chips */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {TYPE_CHIPS.map(c => (
            <button key={c.value} onClick={() => apply({ type: c.value })} style={{
              padding: "5px 12px", borderRadius: 20, fontSize: "0.75rem", cursor: "pointer",
              border: `1px solid ${filters.type === c.value ? "var(--accent)" : "var(--border)"}`,
              background: filters.type === c.value ? "rgba(59,123,245,0.12)" : "none",
              color: filters.type === c.value ? "var(--accent)" : "var(--text-muted)",
              fontFamily: "inherit", transition: "all 0.15s", fontWeight: filters.type === c.value ? 600 : 400,
              display: "flex", alignItems: "center", gap: 5,
            }}>
              {c.Icon && <c.Icon size={12} />}
              {c.label}
            </button>
          ))}

          {/* A radial search is the one filter with no control of its own up
              here: it is started from a media page ("others near this one") or
              from the browser's own position, so this is where it becomes
              visible and adjustable once it exists. */}
          {filters.near && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "4px 10px", borderRadius: 20,
              border: "1px solid var(--accent)", background: "rgba(59,123,245,0.10)",
              fontSize: "0.75rem", color: "var(--accent)", fontWeight: 600,
            }}>
              <Crosshair size={13} />
              <span>تا {faNum(filters.near.radiusKm)} کیلومتر از این نقطه</span>
              <label htmlFor="explore-radius" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                شعاع جست‌وجو به کیلومتر
              </label>
              <select
                id="explore-radius"
                value={filters.near.radiusKm}
                onChange={e => apply({
                  near: { ...filters.near!, radiusKm: Number(e.target.value) },
                  page: 1,
                })}
                style={{
                  background: "var(--bg-surface)", border: "1px solid var(--border)",
                  color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.72rem",
                  borderRadius: 6, padding: "2px 4px", cursor: "pointer",
                }}
              >
                {RADIUS_CHOICES.map(km => (
                  <option key={km} value={km}>{faNum(km)} کیلومتر</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => apply({ near: null, page: 1 })}
                aria-label="برداشتن محدودهٔ مکانی"
                style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0, display: "flex" }}
              >
                <X size={13} />
              </button>
            </div>
          )}

          <button onClick={() => setShowFilters(p => !p)} style={{
            marginRight: "auto", padding: "5px 12px", borderRadius: 20, fontSize: "0.75rem", cursor: "pointer",
            border: `1px solid ${showFilters ? "var(--accent)" : "var(--border)"}`,
            background: showFilters ? "rgba(59,123,245,0.08)" : "none",
            color: showFilters ? "var(--accent)" : "var(--text-muted)",
            fontFamily: "inherit", transition: "all 0.15s",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <SlidersHorizontal size={13} />
            فیلترهای بیشتر
            {hasActiveFilters(filters) && (
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
            )}
          </button>
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div style={{
            background: "var(--bg-surface)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "14px", marginBottom: 4,
            animation: "fadeIn 0.2s ease",
          }}>
            <div style={{ marginBottom: 12 }}>
              <label htmlFor="explore-status" style={labelStyle}>وضعیت</label>
              <select
                id="explore-status"
                value={filters.status}
                onChange={e => apply({ status: e.target.value as ExploreFilters["status"] })}
                style={selectStyle}
              >
                <option value="">همه وضعیت‌ها</option>
                <option value="available">فقط خالی</option>
                <option value="busy">فقط مشغول</option>
              </select>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <label htmlFor="explore-price" style={labelStyle}>حداکثر قیمت</label>
                <span style={{ fontSize: "0.75rem", color: "var(--accent-warm)", fontWeight: 600 }}>{faNum(price)}M تومان/ماه</span>
              </div>
              <input
                id="explore-price"
                type="range" min={MIN_PRICE} max={MAX_PRICE} step={10} value={price}
                onChange={e => { setPrice(+e.target.value); applyDebounced({ maxPrice: +e.target.value }); }}
                style={{ width: "100%" }}
              />
            </div>
            {hasActiveFilters(filters) && (
              <button onClick={() => apply({ search: "", type: "all", status: "", province: "", city: "", maxPrice: MAX_PRICE })} style={{
                marginTop: 10, padding: "6px 14px", borderRadius: 7, fontSize: "0.75rem",
                border: "1px solid var(--border)", background: "none", color: "var(--text-muted)",
                fontFamily: "inherit", cursor: "pointer",
              }}>
                <RotateCcw size={13} style={{ display: "inline", marginLeft: 4, verticalAlign: "middle" }} />
                پاک کردن همه فیلترها
              </button>
            )}
          </div>
        )}
      </div>

      {pending && (
        <div style={{ fontSize: "0.72rem", color: "var(--accent)", marginTop: 8 }}>در حال جستجو...</div>
      )}
    </div>
  );
}

/** The sort dropdown in the sticky results header. */
export function SortSelect({ filters }: { filters: ExploreFilters }) {
  const { apply, pending } = useFilterNavigation(filters);
  return (
    <select
      value={filters.sortBy}
      disabled={pending}
      onChange={e => apply({ sortBy: e.target.value as SortKey })}
      aria-label="ترتیب نمایش"
      style={{
        background: "none", border: "none", color: "var(--text-muted)", fontFamily: "inherit",
        fontSize: "0.78rem", cursor: pending ? "wait" : "pointer", outline: "none",
      }}
    >
      {ALLOWED_SORT.map(k => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
    </select>
  );
}

// ── Shared micro-styles ──────────────────────────────────────────
const selectStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  color: "var(--text-main)",
  fontFamily: "inherit",
  fontSize: "0.82rem",
  padding: "8px 12px",
  borderRadius: 8,
  outline: "none",
  cursor: "pointer",
};
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.72rem",
  color: "var(--text-muted)",
  marginBottom: 5,
  fontWeight: 600,
};
