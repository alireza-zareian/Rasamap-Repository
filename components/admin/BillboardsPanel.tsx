"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import type { Billboard } from "@/lib/types";
import { fetchJson, errorMessage } from "@/lib/client/fetch-json";
import { faNum } from "@/lib/format";
import { TypeIcon } from "@/components/TypeIcon";
import { C, TYPE_LABEL, AVAILABILITY_LABEL, MODERATION_LABEL } from "./constants";
import { BillboardRow } from "./BillboardRow";
import { CreateModal } from "./CreateModal";
import { EditModal } from "./EditModal";
import { ImageManager } from "./ImageManager";
import { usePermissionNotice } from "./PermissionNotice";

/**
 * The media table: search, filters, paging, and the create / edit / photos /
 * delete actions. `initialQuery` prefills the search from `?q=`, so "edit this
 * listing" on the staff bar lands on the row the person was just looking at
 * rather than on page one of 3,536.
 */
export function BillboardsPanel({ canEdit, canManage, initialQuery }: {
  canEdit: boolean; canManage: boolean; initialQuery: string;
}) {
  const [billboards, setBillboards] = useState<Billboard[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(initialQuery);
  const [filterType, setFilterType] = useState("");
  const [filterAvailability, setFilterAvailability] = useState("");
  const [filterModeration, setFilterModeration] = useState("");
  const [sort, setSort] = useState("id_asc");
  const [loading, setLoading] = useState(false);
  const [editTarget, setEditTarget] = useState<Billboard | null>(null);
  const [imgTarget, setImgTarget] = useState<Billboard | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Billboard | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const { notice, deny } = usePermissionNotice();

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      q: search, type: filterType, availability: filterAvailability, moderation: filterModeration,
      page: page.toString(), limit: "20", sort,
    });
    try {
      const data = await fetchJson<{ items: Billboard[]; total: number; pages: number }>(`/api/admin/billboards?${params}`);
      setBillboards(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch {
      setBillboards([]);
    }
    setLoading(false);
  }, [search, filterType, filterAvailability, filterModeration, page, sort]);

  // Data-fetch effect: load() sets loading/list state, as expected.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true); setDeleteError("");
    try {
      await fetchJson(`/api/admin/billboards/${deleteTarget.id}`, { method: "DELETE" });
      setBillboards(prev => prev.filter(b => b.id !== deleteTarget.id));
      setTotal(t => t - 1);
      setDeleteTarget(null);
    } catch (err) { setDeleteError(errorMessage(err)); }
    setDeleting(false);
  };

  const iS: React.CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: C.font, fontSize: "0.8rem", padding: "8px 12px", borderRadius: 8, outline: "none" };
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  return (
    <div>
      {notice}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: "1rem", fontWeight: 800 }}>مدیریت بیلبوردها</div>
          <div style={{ fontSize: "0.75rem", color: C.muted, marginTop: 2 }}>{faNum(total)} آیتم</div>
        </div>
        {canEdit && (
          <button onClick={() => setShowCreate(true)} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", fontWeight: 700, padding: "8px 16px", borderRadius: 8, background: C.green, border: "none", color: "#fff", fontFamily: C.font, cursor: "pointer" }}>
            <Plus size={15} /> بیلبورد جدید
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input placeholder="جستجو..." aria-label="جستجو" value={search} onChange={e => resetPage(setSearch)(e.target.value)} style={{ ...iS, flex: "1 1 200px" }} />
        <select aria-label="نوع رسانه" value={filterType} onChange={e => resetPage(setFilterType)(e.target.value)} style={iS}>
          <option value="">همه انواع</option>
          {Object.entries(TYPE_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="وضعیت رسانه" value={filterAvailability} onChange={e => resetPage(setFilterAvailability)(e.target.value)} style={iS}>
          <option value="">همه وضعیت‌ها</option>
          {Object.entries(AVAILABILITY_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="وضعیت بررسی" value={filterModeration} onChange={e => resetPage(setFilterModeration)(e.target.value)} style={iS}>
          <option value="">همه (بررسی)</option>
          {Object.entries(MODERATION_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="مرتب‌سازی" value={sort} onChange={e => setSort(e.target.value)} style={iS}>
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
                        onEdit={canEdit ? setEditTarget : () => deny("دسترسی ویرایش ندارید")}
                        onDelete={canManage ? row => { setDeleteError(""); setDeleteTarget(row); } : () => deny("دسترسی حذف ندارید")}
                      />
                    ))
              }
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: "14px 0", borderTop: `1px solid ${C.border}` }}>
            <button type="button" aria-label="صفحهٔ قبلی" onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1} style={{ ...iS, cursor: page===1?"default":"pointer", padding: "6px 14px" }}>←</button>
            <span style={{ fontSize: "0.8rem", color: C.muted }}>صفحه {faNum(page)} از {faNum(pages)}</span>
            <button type="button" aria-label="صفحهٔ بعدی" onClick={() => setPage(p => Math.min(pages,p+1))} disabled={page===pages} style={{ ...iS, cursor: page===pages?"default":"pointer", padding: "6px 14px" }}>→</button>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={b => { setBillboards(prev => [b, ...prev]); setTotal(t => t + 1); }}
        />
      )}
      {editTarget && (
        <EditModal
          billboard={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={updated => setBillboards(prev => prev.map(b => b.id === updated.id ? updated : b))}
          onImageManager={b => { setEditTarget(null); setImgTarget(b); }}
        />
      )}
      {imgTarget && <ImageManager billboard={imgTarget} onClose={() => setImgTarget(null)} />}

      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div role="dialog" aria-modal="true" aria-label="حذف بیلبورد" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: "min(420px, 94vw)", direction: "rtl", boxSizing: "border-box" }}>
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
