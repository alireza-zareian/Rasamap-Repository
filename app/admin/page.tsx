"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Billboard } from "@/lib/types";
import type { AdminStats } from "@/lib/admin/types";
import type { UserRole } from "@/lib/auth/session";
import { LayoutDashboard, ClipboardList, ClipboardCheck, Handshake, ShieldCheck, Bot, Users, ScrollText, Plus, Lock, Trash2, AlertTriangle, MapPin, CheckCircle2, ImageOff, Sparkles, Copy } from "lucide-react";
import { C, TYPE_LABEL, STATUS_LABEL, ROLE_LABEL, ROLE_COLOR } from "@/components/admin/constants";
import { TypeIcon } from "@/components/TypeIcon";
import { Badge, StatCard, BarRow } from "@/components/admin/Badge";
import { ImageManager } from "@/components/admin/ImageManager";
import { EditModal } from "@/components/admin/EditModal";
import { BillboardRow } from "@/components/admin/BillboardRow";
import { QualityPanel } from "@/components/admin/QualityPanel";
import { ScraperPanel } from "@/components/admin/ScraperPanel";
import { UsersPanel } from "@/components/admin/UsersPanel";
import { AuditPanel } from "@/components/admin/AuditPanel";
import { CreateModal } from "@/components/admin/CreateModal";
import { ListingsPanel } from "@/components/admin/ListingsPanel";
import { LeadsPanel } from "@/components/admin/LeadsPanel";

type Tab = "overview" | "billboards" | "listings" | "leads" | "quality" | "scraper" | "users" | "audit";
interface SessionUser { id: string; name: string; role: UserRole; email: string; }

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [billboards, setBillboards] = useState<Billboard[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [sort, setSort] = useState("id_asc");
  const [loading, setLoading] = useState(false);
  const [editTarget, setEditTarget] = useState<Billboard | null>(null);
  const [imgTarget, setImgTarget] = useState<Billboard | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Billboard | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [allBillboards, setAllBillboards] = useState<Billboard[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);
  const [permMsg, setPermMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/auth/me")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setUser(d.user); setAuthLoading(false); })
      .catch(() => router.push("/admin/login"));
  }, [router]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/admin/billboards/stats").then(r => r.json()).then(setStats).catch(() => {});
  }, [user]);

  const loadBillboards = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const params = new URLSearchParams({ q: search, type: filterType, status: filterStatus, page: page.toString(), limit: "20", sort });
    try {
      const res = await fetch(`/api/admin/billboards?${params}`);
      const data = await res.json();
      setBillboards(data.items ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
    } catch { setBillboards([]); }
    setLoading(false);
  }, [user, search, filterType, filterStatus, page, sort]);

  // Data-fetch effect: loadBillboards() sets loading/list state, as expected.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (tab === "billboards") loadBillboards(); }, [tab, loadBillboards]);

  useEffect(() => {
    if (tab === "quality" && allBillboards.length === 0 && user)
      fetch("/api/admin/billboards?limit=100&page=1").then(r => r.json()).then(d => setAllBillboards(d.items ?? [])).catch(() => {});
  }, [tab, allBillboards.length, user]);

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.push("/admin/login");
  };

  const handleSaved = (updated: Billboard) => {
    setBillboards(prev => prev.map(b => b.id === updated.id ? updated : b));
    setAllBillboards(prev => prev.map(b => b.id === updated.id ? updated : b));
  };

  const handleCreated = (created: Billboard) => {
    setBillboards(prev => [created, ...prev]);
    setTotal(t => t + 1);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true); setDeleteError("");
    try {
      const res = await fetch(`/api/admin/billboards/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setDeleteError(data.error ?? "خطا در حذف"); setDeleting(false); return; }
      setBillboards(prev => prev.filter(b => b.id !== deleteTarget.id));
      setTotal(t => t - 1);
      setDeleteTarget(null);
    } catch { setDeleteError("خطای شبکه"); }
    setDeleting(false);
  };

  if (authLoading) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: C.font, color: C.muted }}>
      در حال بررسی احراز هویت...
    </div>
  );
  if (!user) return null;

  const canEdit   = ["super_admin","admin","editor"].includes(user.role);
  const canManage = ["super_admin","admin"].includes(user.role);
  const iS: React.CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: C.font, fontSize: "0.8rem", padding: "8px 12px", borderRadius: 8, outline: "none" };
  const navItems: [string, Tab, React.ComponentType<{ size?: number }>][] = [
    ["نمای کلی", "overview", LayoutDashboard],
    ["بیلبوردها", "billboards", ClipboardList],
    ["تأیید آگهی‌ها", "listings", ClipboardCheck],
    ["سرنخ‌ها", "leads", Handshake],
    ["کیفیت", "quality", ShieldCheck],
    ["اسکرپر", "scraper", Bot],
    ["کاربران", "users", Users],
    ["لاگ", "audit", ScrollText],
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: C.font, direction: "rtl", color: C.text }}>

      {/* Permission toast */}
      {permMsg && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#ef4444", color: "#fff", padding: "10px 24px", borderRadius: 10, fontWeight: 700, fontSize: "0.88rem", zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
          {permMsg}
        </div>
      )}

      {/* Topbar */}
      <div className="admin-topbar" style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: "0 28px", minHeight: 60, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
          <Link href="/" style={{ textDecoration: "none", color: C.text, fontSize: "1.1rem", fontWeight: 800 }}>رسا<span style={{ color: C.accent }}>مپ</span></Link>
          <div className="admin-topbar-sep" style={{ width: 1, height: 24, background: C.border }} />
          <span className="admin-topbar-sub" style={{ fontSize: "0.8rem", color: C.muted, fontWeight: 600 }}>پنل مدیریت</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Badge text={ROLE_LABEL[user.role] ?? user.role} color={ROLE_COLOR[user.role] ?? C.muted} bg={`${ROLE_COLOR[user.role] ?? C.muted}18`} />
          <div className="admin-topbar-name" style={{ fontSize: "0.78rem", color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
          <button onClick={handleLogout} disabled={loggingOut} style={{ fontSize: "0.75rem", padding: "6px 12px", borderRadius: 7, border: `1px solid ${C.border}`, background: "none", color: C.muted, fontFamily: C.font, cursor: "pointer", flexShrink: 0 }}>
            {loggingOut ? "..." : "خروج"}
          </button>
        </div>
      </div>

      <div className="admin-shell" style={{ display: "flex", maxWidth: 1400, margin: "0 auto", padding: "24px 20px", gap: 20 }}>
        {/* Sidebar nav */}
        <div className="admin-sidebar" style={{ width: 200, flexShrink: 0 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 8, position: "sticky", top: 76 }}>
            {navItems.map(([label, key, Icon]) => (
              <button key={key} onClick={() => setTab(key)} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "right", padding: "10px 14px", borderRadius: 8, fontSize: "0.82rem", fontWeight: tab === key ? 700 : 400, color: tab === key ? C.accent : C.muted, background: tab === key ? "rgba(255,77,0,0.08)" : "none", border: "none", fontFamily: C.font, cursor: "pointer", marginBottom: 2 }}>
                <Icon size={15} /> {label}
              </button>
            ))}
            <div style={{ margin: "10px 8px 4px", borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
              <Link href="/explore" style={{ display: "block", textAlign: "right", padding: "8px 6px", fontSize: "0.78rem", color: C.muted, textDecoration: "none" }}>← بازگشت</Link>
            </div>
          </div>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Overview tab */}
          {tab === "overview" && (
            <div>
              <div style={{ fontSize: "1.15rem", fontWeight: 800, marginBottom: 6 }}>نمای کلی داشبورد</div>
              <div style={{ fontSize: "0.78rem", color: C.muted, marginBottom: 24 }}>آخرین وضعیت سیستم</div>
              {stats ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 12, marginBottom: 24 }}>
                    <StatCard icon={<ClipboardList size={20} />} label="کل بیلبوردها"  value={stats.total.toLocaleString()}          color={C.accent} />
                    <StatCard icon={<CheckCircle2 size={20} />} label="فعال"           value={stats.active.toLocaleString()}         color={C.green} />
                    <StatCard icon={<MapPin size={20} />} label="دارای مختصات"  value={stats.withCoords.toLocaleString()}     color={C.green}  sub={`${Math.round((stats.withCoords/stats.total)*100)}%`} />
                    <StatCard icon={<AlertTriangle size={20} />} label="بدون مختصات"   value={stats.missingCoords.toLocaleString()}  color="#f59e0b" />
                    <StatCard icon={<ImageOff size={20} />} label="بدون تصویر"    value={stats.missingImages.toLocaleString()}  color="#f59e0b" />
                    <StatCard icon={<Sparkles size={20} />} label="هفته اخیر"     value={stats.recentlyImported.toLocaleString()} color="#8b5cf6" />
                    <StatCard icon={<Copy size={20} />} label="خوشه هم‌مکان (~۵۰م)" value={stats.duplicateGroups.toLocaleString()} color="#ef4444" sub="نقاطی با ۲+ رسانه نزدیک هم" />
                  </div>
                  <div className="admin-3col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                    {([["منابع داده", stats.bySource, C.accent], ["نوع رسانه", stats.byType, "#8b5cf6"], ["شهرها (برتر)", stats.byCity, C.green]] as const).map(([title, data, color]) => {
                      const entries = Object.entries(data as Record<string, number>).sort(([,a],[,b]) => b-a).slice(0,8);
                      const max = Math.max(...Object.values(data as Record<string, number>));
                      return (
                        <div key={title} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
                          <div style={{ fontSize: "0.82rem", fontWeight: 700, marginBottom: 14 }}>{title}</div>
                          {entries.map(([k,v]) => <BarRow key={k} label={title === "نوع رسانه" ? (TYPE_LABEL[k] ?? k) : k} value={v} max={max} color={color} />)}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "60px 0", color: C.muted }}>در حال بارگذاری...</div>
              )}
            </div>
          )}

          {/* Billboards tab */}
          {tab === "billboards" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: "1rem", fontWeight: 800 }}>مدیریت بیلبوردها</div>
                  <div style={{ fontSize: "0.75rem", color: C.muted, marginTop: 2 }}>{total.toLocaleString()} آیتم</div>
                </div>
                {canEdit && (
                  <button onClick={() => setShowCreate(true)} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", fontWeight: 700, padding: "8px 16px", borderRadius: 8, background: C.green, border: "none", color: "#fff", fontFamily: C.font, cursor: "pointer" }}>
                    <Plus size={15} /> بیلبورد جدید
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                <input placeholder="جستجو..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ ...iS, flex: "1 1 200px" }} />
                <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }} style={iS}>
                  <option value="">همه انواع</option>
                  {Object.entries(TYPE_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} style={iS}>
                  <option value="">همه وضعیت‌ها</option>
                  {Object.entries(STATUS_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={sort} onChange={e => setSort(e.target.value)} style={iS}>
                  <option value="id_asc">ID ↑</option>
                  <option value="id_desc">ID ↓</option>
                  <option value="price_desc">قیمت ↓</option>
                  <option value="price_asc">قیمت ↑</option>
                  <option value="name_asc">نام</option>
                </select>
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                    <thead>
                      <tr style={{ background: C.surface }}>
                        {["نام / مکان","نوع","وضعیت","قیمت","مختصات","تصاویر","منبع",""].map(h => (
                          <th key={h} style={{ padding: "11px 12px", textAlign: "right", fontWeight: 600, fontSize: "0.75rem", color: C.muted, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loading
                        ? <tr><td colSpan={8} style={{ padding: 30, textAlign: "center", color: C.muted }}>در حال بارگذاری...</td></tr>
                        : billboards.length === 0
                          ? <tr><td colSpan={8} style={{ padding: 30, textAlign: "center", color: C.muted }}>موردی یافت نشد</td></tr>
                          : billboards.map(b => (
                              <BillboardRow
                                key={b.id} b={b}
                                onEdit={canEdit ? setEditTarget : () => { setPermMsg("دسترسی ویرایش ندارید"); setTimeout(() => setPermMsg(""), 3000); }}
                                onDelete={canManage ? b => { setDeleteError(""); setDeleteTarget(b); } : () => { setPermMsg("دسترسی حذف ندارید"); setTimeout(() => setPermMsg(""), 3000); }}
                              />
                            ))
                      }
                    </tbody>
                  </table>
                </div>
                {pages > 1 && (
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: "14px 0", borderTop: `1px solid ${C.border}` }}>
                    <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1} style={{ ...iS, cursor: page===1?"default":"pointer", padding: "6px 14px" }}>←</button>
                    <span style={{ fontSize: "0.8rem", color: C.muted }}>صفحه {page} از {pages}</span>
                    <button onClick={() => setPage(p => Math.min(pages,p+1))} disabled={page===pages} style={{ ...iS, cursor: page===pages?"default":"pointer", padding: "6px 14px" }}>→</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "listings" && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <ListingsPanel canDecide={canManage} />
            </div>
          )}

          {tab === "leads" && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <LeadsPanel canEdit={canEdit} />
            </div>
          )}

          {tab === "quality" && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <QualityPanel billboards={allBillboards} onFix={canEdit ? setEditTarget : () => { setPermMsg("دسترسی ویرایش ندارید"); setTimeout(() => setPermMsg(""), 3000); }} />
            </div>
          )}
          {tab === "scraper" && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <ScraperPanel stats={stats} />
            </div>
          )}
          {tab === "users" && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              <UsersPanel currentUser={user} />
            </div>
          )}
          {tab === "audit" && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24 }}>
              {canManage
                ? <AuditPanel />
                : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 40, color: C.muted }}><Lock size={16} /> دسترسی فقط برای Admin</div>}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={b => { handleCreated(b); if (tab !== "billboards") setTab("billboards"); }}
        />
      )}
      {editTarget && (
        <EditModal
          billboard={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={handleSaved}
          onImageManager={b => { setEditTarget(null); setImgTarget(b); }}
        />
      )}
      {imgTarget && <ImageManager billboard={imgTarget} onClose={() => setImgTarget(null)} />}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: "min(420px, 94vw)", direction: "rtl", boxSizing: "border-box" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "1rem", fontWeight: 700, marginBottom: 10 }}><Trash2 size={17} /> حذف بیلبورد</div>
            <div style={{ fontSize: "0.85rem", color: C.muted, marginBottom: 6 }}>این عمل برگشت‌پذیر نیست.</div>
            <div style={{ background: C.surface, borderRadius: 10, padding: "12px 14px", marginBottom: 18, fontSize: "0.85rem", fontWeight: 600 }}>
              <TypeIcon type={deleteTarget.type} size={14} /> {deleteTarget.name}
              <span style={{ fontSize: "0.72rem", color: C.muted, marginRight: 8 }}>#{deleteTarget.id}</span>
            </div>
            {deleteError && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "8px 12px", fontSize: "0.78rem", color: "#ef4444", marginBottom: 14 }}>
                <AlertTriangle size={13} style={{ verticalAlign: "-2px" }} /> {deleteError}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleDeleteConfirm} disabled={deleting} style={{ flex: 1, background: "#ef4444", border: "none", color: "#fff", fontFamily: C.font, fontSize: "0.85rem", fontWeight: 700, padding: 11, borderRadius: 9, cursor: deleting ? "default" : "pointer", opacity: deleting ? 0.7 : 1 }}>
                {deleting ? "در حال حذف..." : "بله، حذف شود"}
              </button>
              <button onClick={() => setDeleteTarget(null)} style={{ padding: "11px 20px", background: "none", border: `1px solid ${C.border}`, color: C.muted, fontFamily: C.font, borderRadius: 9, cursor: "pointer" }}>
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
