"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { Search, X, LayoutGrid, List, MapPin, SlidersHorizontal, RotateCcw, Megaphone, Monitor, Milestone, Train, Building2, TriangleAlert, SearchX } from "lucide-react";
import { useTheme } from "@/lib/theme";
import type { Billboard, BillboardType } from "@/lib/types";
import { provinces, getProvince } from "@/lib/iranLocations";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import BillboardCard from "@/components/BillboardCard";
import CompareModal from "@/components/CompareModal";
import CompareBar from "@/components/CompareBar";
import Toast from "@/components/Toast";
import SnakeScroll from "@/components/SnakeScroll";
import { faNum } from "@/lib/format";

// ── Types ────────────────────────────────────────────────────────
interface Filters {
  search: string;
  type: BillboardType | "all";
  status: string;
  maxPrice: number;
  sortBy: "price_asc" | "price_desc" | "traffic_desc" | "area_desc";
  province: string;
  city: string;
}

interface ToastState { msg: string; type: "success" | "error" | "info"; }

const DEFAULT_FILTERS: Filters = {
  search: "", type: "all", status: "",
  maxPrice: 500, sortBy: "price_asc", province: "", city: "",
};

const PAGE_SIZE = 24;

const TYPE_CHIPS: { label: string; value: BillboardType | "all"; Icon?: React.ComponentType<{ size?: number }> }[] = [
  { label: "همه", value: "all" },
  { label: "بیلبورد", value: "billboard", Icon: Megaphone },
  { label: "دیجیتال", value: "digital", Icon: Monitor },
  { label: "عرشه پل", value: "bridge", Icon: Milestone },
  { label: "ایستگاه", value: "station", Icon: Train },
];

const SESSION_KEY = "rasamap_filters";

function saveFilters(f: Filters) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(f)); } catch {}
}
function loadFilters(): Filters {
  try {
    const s = sessionStorage.getItem(SESSION_KEY);
    if (s) return { ...DEFAULT_FILTERS, ...JSON.parse(s) };
  } catch {}
  return DEFAULT_FILTERS;
}

function buildApiUrl(filters: Filters, page: number): string {
  const p = new URLSearchParams();
  if (filters.search)        p.set("search",   filters.search);
  if (filters.type !== "all") p.set("type",    filters.type);
  if (filters.status)        p.set("status",   filters.status);
  if (filters.maxPrice < 500) p.set("maxPrice", String(filters.maxPrice));
  if (filters.sortBy)        p.set("sortBy",   filters.sortBy);
  p.set("page",  String(page));
  p.set("limit", String(PAGE_SIZE));

  if (filters.city) {
    p.set("city", filters.city);
  } else if (filters.province) {
    const prov = getProvince(filters.province);
    if (prov) p.set("cities", prov.cities.map(c => c.name).join(","));
  }

  return `/api/billboards?${p.toString()}`;
}

// ── Main page ────────────────────────────────────────────────────
export default function ExplorePage() {
  const { theme } = useTheme();
  const dark = theme === "dark";

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [items, setItems] = useState<Billboard[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(false);
  const [compareList, setCompareList] = useState<Billboard[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [mounted, setMounted] = useState(false);
  const didMountRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Showcase carousel — billboards with real images
  const [showcase, setShowcase] = useState<Billboard[]>([]);
  const [showcaseIdx, setShowcaseIdx] = useState(0);

  useEffect(() => {
    fetch("/api/billboards?sortBy=traffic_desc&limit=20&page=1")
      .then(r => r.json())
      .then(data => {
        const withImages = (data.items ?? []).filter(
          (b: Billboard) => b.images && b.images.length > 0
        );
        setShowcase(withImages.slice(0, 12));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (showcase.length < 2) return;
    const id = setInterval(() => setShowcaseIdx(i => (i + 1) % showcase.length), 5500);
    return () => clearInterval(id);
  }, [showcase.length]);

  useEffect(() => {
    const saved = loadFilters();
    // URL params override saved filters — lets landing page pre-filter explore
    const params = new URLSearchParams(window.location.search);
    const urlType    = params.get("type");
    const urlCity    = params.get("city");
    const urlSearch  = params.get("search");
    const urlProv    = params.get("province");

    const merged = { ...saved };
    if (urlType)   merged.type   = urlType as Filters["type"];
    if (urlSearch) merged.search = urlSearch;
    if (urlProv)   merged.province = urlProv;
    if (urlCity) {
      merged.city = urlCity;
      // Auto-detect province when only city is given
      if (!urlProv) {
        const found = provinces.find(p =>
          getProvince(p.name)?.cities.some(c => c.name === urlCity)
        );
        if (found) merged.province = found.name;
      }
    }

    // Mount-only hydration from the URL query + saved filters (browser-only
    // sources, not available during SSR render).
    /* eslint-disable react-hooks/set-state-in-effect */
    setFilters(merged);
    setFiltersLoaded(true);
    setMounted(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Persist compareList to localStorage so /compare page can read it
  useEffect(() => {
    try { localStorage.setItem("rasamap_compare", JSON.stringify(compareList)); } catch {}
  }, [compareList]);

  const fetchBillboards = useCallback(async (f: Filters, pg: number) => {
    setDataLoading(true);
    setDataError(false);
    try {
      const res = await fetch(buildApiUrl(f, pg));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 0);
    } catch {
      setDataError(true);
    } finally {
      setDataLoading(false);
    }
  }, []);

  // Fetch when filtersLoaded (initial) or page changes. fetchBillboards sets
  // loading/error state — expected for a data-fetch effect. `filters` is read
  // but intentionally not a dep: filter changes are handled by the debounced
  // effect below, this one only reacts to pagination.
  useEffect(() => {
    if (!filtersLoaded) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBillboards(filters, page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersLoaded, page]);

  // Save filters + debounced fetch when filters change
  useEffect(() => {
    if (!filtersLoaded) return;
    if (!didMountRef.current) { didMountRef.current = true; return; }
    saveFilters(filters);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchBillboards(filters, 1), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, filtersLoaded]);

  const setF = useCallback(<K extends keyof Filters>(k: K, v: Filters[K]) => {
    setFilters(prev => ({ ...prev, [k]: v }));
  }, []);

  const showToast = useCallback((msg: string, type: "success" | "error" | "info" = "info") =>
    setToast({ msg, type }), []);

  const handleProvinceChange = useCallback((province: string) => {
    setFilters(prev => ({ ...prev, province, city: "" }));
  }, []);

  const sortedProvinces = [...provinces].sort((a, b) => a.name.localeCompare(b.name, "fa"));
  const citiesOfProvince = filters.province ? (getProvince(filters.province)?.cities ?? []) : [];

  const hasActiveFilters = filters.search || filters.type !== "all" ||
    filters.status || filters.maxPrice < 500 || filters.province || filters.city;

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const handleCompare = useCallback((b: Billboard) => {
    setCompareList(prev => {
      const exists = prev.find(x => x.id === b.id);
      if (exists) return prev.filter(x => x.id !== b.id);
      if (prev.length >= 2) { showToast("حداکثر ۲ رسانه را می‌توانید مقایسه کنید", "error"); return prev; }
      showToast(`${b.name.substring(0, 22)}... به مقایسه اضافه شد`, "info");
      return [...prev, b];
    });
  }, [showToast]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-deep)" }}>
      <SnakeScroll />
      <Topbar />

      <main style={{ paddingTop: 62, flex: 1, display: "flex", flexDirection: "column" }}>

        {/* ── Hero: search (right) + live showcase (left) ──────── */}
        <div className="explore-hero" style={{
          display: "grid",
          gridTemplateColumns: "1fr minmax(320px, 360px)",
          borderBottom: "1px solid var(--border)",
        }}>
          {/* ── Right: search panel ─────────────────────────────── */}
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
                  <button key={m} onClick={() => setViewMode(m)} style={{
                    width: 30, height: 30, borderRadius: 6, border: "none", cursor: "pointer",
                    background: viewMode === m ? "var(--accent)" : "none",
                    color: viewMode === m ? "#fff" : "var(--text-muted)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.15s",
                  }}>
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
                value={filters.search}
                onChange={e => setF("search", e.target.value)}
                placeholder="جستجو — نام، منطقه، خیابان، شهر..."
                style={{
                  background: "none", border: "none", flex: 1, fontFamily: "inherit",
                  fontSize: "0.9rem", color: "var(--text-main)", outline: "none",
                }}
              />
              {filters.search && (
                <button onClick={() => setF("search", "")} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex" }}>
                  <X size={15} />
                </button>
              )}
            </div>

            {/* Province + City */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <select value={filters.province} onChange={e => handleProvinceChange(e.target.value)} style={selectStyle}>
                <option value="">همه استان‌ها</option>
                {sortedProvinces.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
              <select
                value={filters.city}
                onChange={e => setF("city", e.target.value)}
                disabled={!filters.province}
                suppressHydrationWarning
                style={{ ...selectStyle, opacity: filters.province ? 1 : 0.5, cursor: filters.province ? "pointer" : "not-allowed" }}
              >
                <option value="">{filters.province ? "همه شهرها" : "ابتدا استان انتخاب کنید"}</option>
                {citiesOfProvince.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>

            {/* Type chips */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {TYPE_CHIPS.map(c => (
                <button key={c.value} onClick={() => setF("type", c.value)} style={{
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
                {hasActiveFilters && (
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
                  <label style={labelStyle}>وضعیت</label>
                  <select value={filters.status} onChange={e => setF("status", e.target.value)} style={selectStyle}>
                    <option value="">همه وضعیت‌ها</option>
                    <option value="available">فقط خالی</option>
                    <option value="busy">فقط مشغول</option>
                  </select>
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <label style={labelStyle}>حداکثر قیمت</label>
                    <span style={{ fontSize: "0.75rem", color: "var(--accent-warm)", fontWeight: 600 }}>{filters.maxPrice}M تومان/ماه</span>
                  </div>
                  <input type="range" min={10} max={500} step={10} value={filters.maxPrice}
                    onChange={e => setF("maxPrice", +e.target.value)} style={{ width: "100%" }} />
                </div>
                {hasActiveFilters && (
                  <button onClick={resetFilters} style={{
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

          {/* ── Left: live billboard showcase (drops below search on mobile) ── */}
          <div className="explore-hero-showcase" style={{ position: "relative", overflow: "hidden", aspectRatio: "1 / 1", alignSelf: "start", background: "var(--bg-card)" }}>
            {showcase.length > 0 ? (
              <>
                {/* Image — key triggers fadeIn on each slide change */}
                <div
                  key={showcaseIdx}
                  style={{ position: "absolute", inset: 0, animation: "fadeIn 0.6s ease" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={showcase[showcaseIdx].images[0]}
                    alt={showcase[showcaseIdx].name}
                    decoding="async"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  {/* Dark gradient for text legibility — always dark since image fills entirely */}
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(to top, rgba(5,10,20,0.88) 0%, rgba(5,10,20,0.12) 50%, transparent 100%)",
                  }} />
                </div>

                {/* Billboard info */}
                <div style={{
                  position: "absolute", bottom: 0, right: 0, left: 0,
                  padding: "16px 20px",
                }}>
                  {/* Label */}
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: "rgba(0,209,122,0.12)", border: "1px solid rgba(0,209,122,0.30)",
                    borderRadius: 20, padding: "3px 10px", marginBottom: 8,
                    fontSize: "0.68rem", color: "var(--green-accent)", fontWeight: 600,
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--green-accent)" }} />
                    پربازدیدترین رسانه‌ها
                  </div>

                  <div style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", marginBottom: 4, lineHeight: 1.3 }}>
                    {showcase[showcaseIdx].name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.65)", display: "flex", alignItems: "center", gap: 4 }}>
                      <MapPin size={11} /> {showcase[showcaseIdx].region} · {showcase[showcaseIdx].location.substring(0, 35)}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginRight: 8 }}>
                      <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "var(--accent-warm)" }}>{showcase[showcaseIdx].price}M</span>
                      <a href={`/billboard/${showcase[showcaseIdx].slug}`} style={{ fontSize: "0.72rem", fontWeight: 700, color: "#fff", background: "var(--accent)", padding: "3px 10px", borderRadius: 6, textDecoration: "none", whiteSpace: "nowrap" }}>مشاهده رسانه ←</a>
                    </div>
                  </div>

                  {/* Dot indicators */}
                  <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
                    {showcase.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setShowcaseIdx(i)}
                        style={{
                          width: i === showcaseIdx ? 18 : 6,
                          height: 6, borderRadius: 3,
                          background: i === showcaseIdx ? "var(--accent)" : dark ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.20)",
                          border: "none", cursor: "pointer", padding: 0,
                          transition: "width 0.3s ease, background 0.2s",
                        }}
                      />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              /* Skeleton while loading */
              <div style={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center",
                justifyContent: "center", flexDirection: "column", gap: 8,
                color: "var(--text-muted)",
              }}>
                <div style={{ opacity: 0.3, display: "flex" }}><Building2 size={40} strokeWidth={1.4} /></div>
                <div style={{ fontSize: "0.75rem" }}>در حال بارگذاری تصاویر...</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Results header ───────────────────────────────────── */}
        <div style={{
          padding: "10px 24px", display: "flex", alignItems: "center",
          justifyContent: "space-between", borderBottom: "1px solid var(--border)",
          background: "var(--bg-deep)", position: "sticky", top: 62, zIndex: 10,
        }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            {dataLoading ? "در حال جستجو..." : (
              <><span style={{ color: "var(--accent)", fontWeight: 700 }}>{faNum(total)}</span> رسانه یافت شد</>
            )}
          </div>
          <select value={filters.sortBy} onChange={e => setF("sortBy", e.target.value as Filters["sortBy"])} style={{
            background: "none", border: "none", color: "var(--text-muted)", fontFamily: "inherit",
            fontSize: "0.78rem", cursor: "pointer", outline: "none",
          }}>
            <option value="price_asc">قیمت: کم به زیاد</option>
            <option value="price_desc">قیمت: زیاد به کم</option>
            <option value="traffic_desc">بیشترین بازدید</option>
            <option value="area_desc">بزرگترین سطح</option>
          </select>
        </div>

        {/* ── Results grid/list ────────────────────────────────── */}
        {!mounted || dataLoading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
            در حال بارگذاری...
          </div>
        ) : dataError ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: "var(--text-muted)", padding: 60 }}>
            <div style={{ display: "flex", color: "var(--accent-warm)" }}><TriangleAlert size={44} strokeWidth={1.5} /></div>
            <div style={{ fontSize: "1rem", fontWeight: 600 }}>خطا در بارگذاری رسانه‌ها</div>
            <button onClick={() => fetchBillboards(filters, page)} style={{ padding: "8px 20px", borderRadius: 8, fontSize: "0.82rem", border: "1px solid var(--border)", background: "none", color: "var(--accent)", fontFamily: "inherit", cursor: "pointer" }}>
              تلاش دوباره
            </button>
          </div>
        ) : items.length === 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: "var(--text-muted)", padding: 60 }}>
            <div style={{ display: "flex" }}><SearchX size={44} strokeWidth={1.5} /></div>
            <div style={{ fontSize: "1rem", fontWeight: 600 }}>رسانه‌ای با این فیلترها یافت نشد</div>
            <button onClick={resetFilters} style={{ padding: "8px 20px", borderRadius: 8, fontSize: "0.82rem", border: "1px solid var(--border)", background: "none", color: "var(--accent)", fontFamily: "inherit", cursor: "pointer" }}>
              پاک کردن فیلترها
            </button>
          </div>
        ) : (
          <>
            <div style={{
              padding: "16px 20px",
              display: viewMode === "grid" ? "grid" : "flex",
              gridTemplateColumns: viewMode === "grid" ? "repeat(auto-fill, minmax(320px, 1fr))" : undefined,
              flexDirection: viewMode === "list" ? "column" : undefined,
              gap: viewMode === "grid" ? 16 : 0,
            }}>
              {items.map(b => (
                <BillboardCard
                  key={b.id}
                  billboard={b}
                  isSelected={false}
                  isCompared={compareList.some(x => x.id === b.id)}
                  onCompare={() => handleCompare(b)}
                  listMode={viewMode === "list"}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "20px 20px 32px" }}>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  style={{ ...pageBtnStyle, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? "not-allowed" : "pointer" }}
                >
                  ‹ قبلی
                </button>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "0 8px" }}>
                  صفحه {faNum(page)} از {faNum(totalPages)}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  style={{ ...pageBtnStyle, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? "not-allowed" : "pointer" }}
                >
                  بعدی ›
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Modals */}
      {showCompareModal && compareList.length >= 2 && (
        <CompareModal
          items={compareList}
          onClose={() => setShowCompareModal(false)}
        />
      )}
      <CompareBar
        items={compareList}
        onRemove={id => setCompareList(prev => prev.filter(b => b.id !== id))}
        onCompare={() => setShowCompareModal(true)}
        onClear={() => setCompareList([])}
      />
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <Footer />
    </div>
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
const pageBtnStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  color: "var(--text-main)",
  fontFamily: "inherit",
  fontSize: "0.85rem",
  fontWeight: 600,
  padding: "9px 20px",
  borderRadius: 9,
};
