"use client";
import { useState } from "react";
import { Billboard, BillboardType, typeLabels } from "@/lib/data";
import { provinces, getProvince } from "@/lib/iranLocations";
import BillboardCard from "./BillboardCard";
import AnalyticsTab from "./AnalyticsTab";
import { Megaphone, Monitor, Milestone, Train, Search, X, LayoutList, BarChart2, Bookmark, MapPin } from "lucide-react";

interface Filters {
  search: string;
  type: BillboardType | "all";
  region: string;
  status: string;
  maxPrice: number;
  sortBy: "price_asc" | "price_desc" | "traffic_desc" | "area_desc";
}

interface Props {
  billboards: Billboard[];
  selectedId: number | null;
  compareIds: number[];
  onSelect: (b: Billboard) => void;
  onCompare: (b: Billboard) => void;
  onBook: (b: Billboard) => void;
  onOpenDetails: (b: Billboard) => void;
  selectedProvince: string;
  selectedCity: string;
  onProvinceChange: (province: string) => void;
  onCityChange: (city: string) => void;
}

const typeChips: { label: string; value: BillboardType | "all"; Icon?: React.ComponentType<{ size?: number }> }[] = [
  { label: "همه", value: "all" },
  { label: "بیلبورد", value: "billboard", Icon: Megaphone },
  { label: "دیجیتال", value: "digital", Icon: Monitor },
  { label: "عرشه پل", value: "bridge", Icon: Milestone },
  { label: "ایستگاه", value: "station", Icon: Train },
];

export default function Sidebar({ billboards, selectedId, compareIds, onSelect, onCompare, onBook, onOpenDetails, selectedProvince, selectedCity, onProvinceChange, onCityChange }: Props) {
  const [activeTab, setActiveTab] = useState<"list" | "analytics" | "saved">("list");
  const [filters, setFilters] = useState<Filters>({ search: "", type: "all", region: "", status: "", maxPrice: 500, sortBy: "price_asc" });

  const setF = (k: keyof Filters, v: string | number) => setFilters(f => ({ ...f, [k]: v }));

  const sortedProvinces = [...provinces].sort((a, b) => a.name.localeCompare(b.name, "fa"));
  const citiesOfSelectedProvince = selectedProvince ? (getProvince(selectedProvince)?.cities ?? []) : [];

  const filtered = billboards
    .filter(b => {
      if (filters.type !== "all" && b.type !== filters.type) return false;
      if (filters.region && b.region !== filters.region) return false;
      if (filters.status && b.status !== filters.status) return false;
      if (b.price > filters.maxPrice) return false;
      if (filters.search) {
        const s = filters.search.toLowerCase();
        if (!b.name.includes(s) && !b.location.includes(s) && !b.region.includes(s)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (filters.sortBy === "price_asc") return a.price - b.price;
      if (filters.sortBy === "price_desc") return b.price - a.price;
      if (filters.sortBy === "traffic_desc") return b.traffic.estimatedViews - a.traffic.estimatedViews;
      return (b.width * b.height) - (a.width * a.height);
    });

  const regions = [...new Set(billboards.map(b => b.region))];

  return (
    <aside style={{ width: 380, minWidth: 340, background: "var(--bg-card)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--bg-deep)" }}>
        {([
          ["list",      "لیست",      LayoutList],
          ["analytics", "آمار",       BarChart2],
          ["saved",     "ذخیره‌ها",  Bookmark],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{ flex: 1, padding: "13px 6px", textAlign: "center", fontSize: "0.78rem", fontWeight: activeTab === id ? 600 : 400, cursor: "pointer", border: "none", background: "none", color: activeTab === id ? "var(--accent)" : "var(--text-muted)", borderBottom: `2px solid ${activeTab === id ? "var(--accent)" : "transparent"}`, fontFamily: "inherit", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* LIST TAB */}
      {activeTab === "list" && (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          {/* Province → City selection */}
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 7, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}><MapPin size={11} /> انتخاب استان و شهر</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <select value={selectedProvince} onChange={e => onProvinceChange(e.target.value)} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.78rem", padding: "7px 10px", borderRadius: 8, outline: "none", cursor: "pointer" }}>
                <option value="">همه استان‌ها</option>
                {sortedProvinces.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
              <select value={selectedCity} onChange={e => onCityChange(e.target.value)} disabled={!selectedProvince} suppressHydrationWarning style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.78rem", padding: "7px 10px", borderRadius: 8, outline: "none", cursor: selectedProvince ? "pointer" : "not-allowed", opacity: selectedProvince ? 1 : 0.55 }}>
                <option value="">{selectedProvince ? "همه شهرهای استان" : "ابتدا استان را انتخاب کنید"}</option>
                {citiesOfSelectedProvince.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {/* Search */}
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", marginBottom: 10 }}>
              <Search size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <input value={filters.search} onChange={e => setF("search", e.target.value)} placeholder="جستجو — نام، منطقه، خیابان..." style={{ background: "none", border: "none", color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.85rem", flex: 1, outline: "none" }} />
              {filters.search && <button onClick={() => setF("search", "")} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex" }}><X size={14} /></button>}
            </div>

            {/* Type chips */}
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
              {typeChips.map(c => (
                <button key={c.value} onClick={() => setF("type", c.value)} style={{ padding: "4px 10px", borderRadius: 20, fontSize: "0.73rem", border: `1px solid ${filters.type === c.value ? "var(--accent)" : "var(--border)"}`, background: filters.type === c.value ? "rgba(59,123,245,0.10)" : "none", color: filters.type === c.value ? "var(--accent)" : "var(--text-muted)", cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 4 }}>
                  {c.Icon && <c.Icon size={11} />}
                  {c.label}
                </button>
              ))}
            </div>

            {/* Select filters */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <select value={filters.region} onChange={e => setF("region", e.target.value)} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.78rem", padding: "7px 10px", borderRadius: 8, outline: "none", cursor: "pointer" }}>
                <option value="">همه مناطق</option>
                {regions.map(r => <option key={r}>{r}</option>)}
              </select>
              <select value={filters.status} onChange={e => setF("status", e.target.value)} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.78rem", padding: "7px 10px", borderRadius: 8, outline: "none", cursor: "pointer" }}>
                <option value="">همه وضعیت‌ها</option>
                <option value="available">فقط خالی</option>
                <option value="busy">فقط مشغول</option>
              </select>
            </div>

            {/* Price range */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.73rem", color: "var(--text-muted)", marginBottom: 5 }}>
                <span>حداکثر قیمت</span>
                <span style={{ color: "var(--accent-warm)", fontWeight: 600 }}>{filters.maxPrice}M تومان/ماه</span>
              </div>
              <input type="range" min={10} max={500} step={10} value={filters.maxPrice} onChange={e => setF("maxPrice", +e.target.value)} style={{ width: "100%" }} />
            </div>
          </div>

          {/* Results header */}
          <div style={{ padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              <span style={{ color: "var(--accent)", fontWeight: 700 }}>{filtered.length}</span> رسانه یافت شد
            </div>
            <select value={filters.sortBy} onChange={e => setF("sortBy", e.target.value)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontFamily: "inherit", fontSize: "0.73rem", cursor: "pointer", outline: "none" }}>
              <option value="price_asc">قیمت: کم به زیاد</option>
              <option value="price_desc">قیمت: زیاد به کم</option>
              <option value="traffic_desc">بیشترین بازدید</option>
              <option value="area_desc">بزرگترین سطح</option>
            </select>
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1, paddingBottom: 8 }}>
            {filtered.length === 0
              ? <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: 10 }}>🔍</div>
                <div>رسانه‌ای با این فیلترها یافت نشد</div>
              </div>
              : filtered.map(b => (
                <BillboardCard key={b.id} billboard={b}
                  isSelected={selectedId === b.id}
                  isCompared={compareIds.includes(b.id)}
                  onSelect={() => onSelect(b)}
                  onCompare={() => onCompare(b)}
                  onBook={() => onBook(b)}
                  onOpenDetails={() => onOpenDetails(b)}
                />
              ))
            }
          </div>
        </div>
      )}

      {activeTab === "analytics" && <AnalyticsTab />}

      {activeTab === "saved" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "var(--text-muted)", padding: 40 }}>
          <div style={{ fontSize: "3rem" }}>🔖</div>
          <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>هنوز رسانه‌ای ذخیره نکردید</div>
          <div style={{ fontSize: "0.75rem", textAlign: "center", lineHeight: 1.6 }}>با کلیک روی آیکون ستاره در کارت‌ها، رسانه‌های موردنظرتان را ذخیره کنید</div>
        </div>
      )}
    </aside>
  );
}