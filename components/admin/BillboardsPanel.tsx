"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, AlertTriangle, ChevronRight, ChevronLeft } from "lucide-react";
import type { Billboard } from "@/lib/types";
import { fetchJson, errorMessage, isAborted } from "@/lib/client/fetch-json";
import { faNum } from "@/lib/format";
import { TypeIcon } from "@/components/TypeIcon";
import { Button } from "@/components/ui/Button";
import { Dialog, dialogStyles } from "@/components/ui/Dialog";
import form from "@/components/ui/form.module.css";
import { TYPE_LABEL, AVAILABILITY_LABEL, MODERATION_LABEL } from "./constants";
import { BillboardRow } from "./BillboardRow";
import { CreateModal } from "./CreateModal";
import { EditModal } from "./EditModal";
import { ImageManager } from "./ImageManager";
import { usePermissionNotice } from "./PermissionNotice";
import styles from "./admin.module.css";
import own from "./BillboardsPanel.module.css";

/** How long the search box waits after the last keystroke. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The media table: search, filters, paging, create, edit, photos, delete.
 * `initialQuery` prefills the search from `?q=`, so the staff bar's "edit"
 * lands on the row in question.
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
  const [visibilityTarget, setVisibilityTarget] = useState<Billboard | null>(null);
  const [visibilityNote, setVisibilityNote] = useState("");
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [visibilityError, setVisibilityError] = useState("");
  // Shown instead of "nothing found" when the load failed.
  const [loadError, setLoadError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const { notice, deny } = usePermissionNotice();

  // What the box shows at once, and what is searched once typing pauses: a
  // request per keystroke, answering out of order, could leave the table on
  // the rows for «ت» after «تهران».
  const [searchInput, setSearchInput] = useState(initialQuery);
  useEffect(() => {
    if (searchInput === search) return;
    const id = setTimeout(() => { setSearch(searchInput); setPage(1); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [searchInput, search]);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    const params = new URLSearchParams({
      q: search, type: filterType, availability: filterAvailability, moderation: filterModeration,
      page: page.toString(), limit: "20", sort,
    });
    try {
      const data = await fetchJson<{ items: Billboard[]; total: number; pages: number }>(`/api/admin/billboards?${params}`, { signal });
      setBillboards(data.items);
      setTotal(data.total);
      setPages(data.pages);
      setLoadError("");
    } catch (err) {
      // Overtaken by a newer filter: its own request owns the table now.
      if (isAborted(err)) return;
      setBillboards([]);
      setLoadError(errorMessage(err));
    }
    setLoading(false);
  }, [search, filterType, filterAvailability, filterModeration, page, sort]);

  // Data-fetch effect: load() sets loading/list state, as expected. A newer
  // filter aborts the older request, so answers cannot land out of order.
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

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

  const handleVisibilityConfirm = async () => {
    if (!visibilityTarget) return;
    const visible = visibilityTarget.moderation === "suspended";
    setVisibilityBusy(true); setVisibilityError("");
    try {
      const { moderation } = await fetchJson<{ moderation: Billboard["moderation"] }>(
        `/api/admin/billboards/${visibilityTarget.id}/visibility`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visible, ...(visibilityNote.trim() ? { note: visibilityNote.trim() } : {}) }),
        },
      );
      setBillboards(prev => prev.map(b => b.id === visibilityTarget.id ? { ...b, moderation } : b));
      setVisibilityTarget(null);
    } catch (err) { setVisibilityError(errorMessage(err)); }
    setVisibilityBusy(false);
  };

  const resetPage = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
  const COLUMNS = ["نام / مکان", "نوع", "وضعیت", "قیمت", "مختصات", "تصاویر", "منبع", ""];
  const taking = visibilityTarget?.moderation === "approved";

  return (
    <div>
      {notice}
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>مدیریت بیلبوردها</h1>
          <div className={styles.count}>{faNum(total)} آیتم</div>
        </div>
        {canEdit && <Button intent="success" onClick={() => setShowCreate(true)}><Plus size={15} /> بیلبورد جدید</Button>}
      </div>
      <div className={styles.toolbar}>
        <input className={`${styles.control} ${styles.search}`} placeholder="جستجو..." aria-label="جستجو" value={searchInput} onChange={e => setSearchInput(e.target.value)} />
        <select className={styles.control} aria-label="نوع رسانه" value={filterType} onChange={e => resetPage(setFilterType)(e.target.value)}>
          <option value="">همه انواع</option>
          {Object.entries(TYPE_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={styles.control} aria-label="وضعیت رسانه" value={filterAvailability} onChange={e => resetPage(setFilterAvailability)(e.target.value)}>
          <option value="">همه وضعیت‌ها</option>
          {Object.entries(AVAILABILITY_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={styles.control} aria-label="وضعیت بررسی" value={filterModeration} onChange={e => resetPage(setFilterModeration)(e.target.value)}>
          <option value="">همه (بررسی)</option>
          {Object.entries(MODERATION_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={styles.control} aria-label="مرتب‌سازی" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="id_asc">ID ↑</option>
          <option value="id_desc">ID ↓</option>
          <option value="price_desc">قیمت ↓</option>
          <option value="price_asc">قیمت ↑</option>
          <option value="name_asc">نام</option>
        </select>
      </div>
      <div className={styles.tableCard}>
        <div className={styles.scroll}>
          <table className={`${styles.table} ${own.wide}`} aria-busy={loading}>
            <thead>
              <tr>{COLUMNS.map((h, i) => <th key={i}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {loading
                ? <tr><td colSpan={COLUMNS.length} className={styles.stateCell}>در حال بارگذاری...</td></tr>
                : loadError
                  ? <tr><td colSpan={COLUMNS.length} role="alert" className={`${styles.stateCell} ${styles.errorCell}`}>فهرست خوانده نشد. {loadError}</td></tr>
                : billboards.length === 0
                  ? <tr><td colSpan={COLUMNS.length} className={styles.stateCell}>موردی یافت نشد</td></tr>
                  : billboards.map(b => (
                      <BillboardRow
                        key={b.id} b={b}
                        onEdit={canEdit ? setEditTarget : () => deny("دسترسی ویرایش ندارید")}
                        onDelete={canManage ? row => { setDeleteError(""); setDeleteTarget(row); } : () => deny("دسترسی حذف ندارید")}
                        onVisibility={canEdit ? row => { setVisibilityError(""); setVisibilityNote(""); setVisibilityTarget(row); } : () => deny("دسترسی تغییر وضعیت انتشار ندارید")}
                      />
                    ))
              }
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className={styles.pager}>
            <Button size="sm" aria-label="صفحهٔ قبلی" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronRight size={14} /></Button>
            <span>صفحه {faNum(page)} از {faNum(pages)}</span>
            <Button size="sm" aria-label="صفحهٔ بعدی" onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}><ChevronLeft size={14} /></Button>
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

      {visibilityTarget && (
        <Dialog
          size="sm"
          title={taking ? "توقف انتشار رسانه" : "انتشار دوبارهٔ رسانه"}
          onClose={() => setVisibilityTarget(null)}
          footer={<>
            <Button intent="primary" onClick={handleVisibilityConfirm} disabled={visibilityBusy}>{visibilityBusy ? "در حال ثبت…" : "تأیید"}</Button>
            <Button intent="quiet" onClick={() => setVisibilityTarget(null)}>انصراف</Button>
          </>}
        >
          <p className={dialogStyles.lead}>
            {taking
              ? "رسانه از جستجو، نقشه و صفحهٔ عمومی حذف می‌شود؛ خودِ ردیف، نظرها و سرنخ‌هایش می‌مانند و هر وقت خواستید برمی‌گردد."
              : "رسانه دوباره برای همهٔ بازدیدکنندگان نمایش داده می‌شود."}
          </p>
          <div className={dialogStyles.subject}><TypeIcon type={visibilityTarget.type} size={14} /> {visibilityTarget.name}</div>
          {taking && (
            <div className={form.field}>
              <label htmlFor="visibility-note" className={form.label}>دلیل (اختیاری — برای ثبت‌کنندهٔ آگهی نمایش داده می‌شود)</label>
              <textarea id="visibility-note" className={form.input} value={visibilityNote} onChange={e => setVisibilityNote(e.target.value)} maxLength={1000} rows={3} />
            </div>
          )}
          {visibilityError && <div role="alert" className={form.error}><AlertTriangle size={13} /> {visibilityError}</div>}
        </Dialog>
      )}

      {deleteTarget && (
        <Dialog
          size="sm"
          icon={<Trash2 size={17} />}
          title="حذف بیلبورد"
          onClose={() => setDeleteTarget(null)}
          footer={<>
            <Button intent="danger" onClick={handleDeleteConfirm} disabled={deleting}>{deleting ? "در حال حذف..." : "بله، حذف شود"}</Button>
            <Button intent="quiet" onClick={() => setDeleteTarget(null)}>انصراف</Button>
          </>}
        >
          <p className={dialogStyles.lead}>این عمل برگشت‌پذیر نیست.</p>
          <div className={dialogStyles.subject}>
            <TypeIcon type={deleteTarget.type} size={14} /> {deleteTarget.name} <small>#{deleteTarget.id}</small>
          </div>
          {deleteError && <div role="alert" className={form.error}><AlertTriangle size={13} /> {deleteError}</div>}
        </Dialog>
      )}
    </div>
  );
}
