"use client";
import { useState, useEffect, useCallback } from "react";
import { fetchJson, errorMessage } from "@/lib/client/fetch-json";
import { Badge } from "./Badge";
import { TypeIcon } from "@/components/media/TypeIcon";
import { leadStatusLabels, LEAD_STATUSES } from "@/lib/types";
import { Handshake, Inbox, Repeat, Save } from "lucide-react";
import { faNum } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { cssVar } from "@/components/ui/css-var";
import form from "@/components/ui/form.module.css";
import styles from "./admin.module.css";

const PAGE_SIZE = 50;

interface Lead {
  id: number;
  status: string;
  note: string | null;
  count: number;
  lastRequestedAt: string;
  createdAt: string;
  user: { id: number; name: string; phone: string } | null;
  billboard: { id: number; name: string; slug: string; city: string; type: string; price: number; agency: string; phone: string } | null;
}

const STATUS_TONE: Record<string, string> = {
  new:       "var(--accent)",
  contacted: "#f59e0b",
  closed:    "var(--green)",
};
const statusTone = (s: string) => STATUS_TONE[s] ?? "var(--text-muted)";

const fmt = (d: string) => new Date(d).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric" });

/**
 * Leads: who asked for which owner's number (§17, §23). Rows come only from
 * POST /api/billboards/[slug]/contact; here staff set the follow-up state and a memo.
 */
export function LeadsPanel({ canEdit }: { canEdit: boolean }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  // Paged, like the approval queue.
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});

  type LeadsPage = { leads: Lead[]; counts: Record<string, number>; total: number; pages: number };
  const fetchPage = useCallback(
    (n: number, limit = PAGE_SIZE) => fetchJson<LeadsPage>(`/api/admin/leads?status=${filter}&limit=${limit}&page=${n}`),
    [filter],
  );

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await fetchPage(1);
      setLeads(data.leads); setCounts(data.counts); setTotal(data.total); setPage(1); setPages(data.pages);
    } catch (err) {
      setLeads([]); setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true); setError("");
    try {
      const data = await fetchPage(page + 1);
      setLeads(prev => [...prev, ...data.leads.filter(l => !prev.some(p => p.id === l.id))]);
      setCounts(data.counts); setTotal(data.total); setPage(page + 1); setPages(data.pages);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const patch = async (id: number, body: { status?: string; note?: string }) => {
    if (busyId) return;                        // one write in flight at a time
    setBusyId(id); setError("");
    try {
      const data = await fetchJson<{ lead: Lead }>(`/api/admin/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const saved: Lead = data.lead;
      // A row the filter no longer matches leaves the list.
      if (filter && saved.status !== filter) setLeads(prev => prev.filter(l => l.id !== id));
      else setLeads(prev => prev.map(l => (l.id === id ? saved : l)));
      setNotes(prev => { const n = { ...prev }; delete n[id]; return n; });

      // Re-read the counts; on failure the old ones stay — the save succeeded.
      const fresh = await fetchPage(1, 1).catch(() => null);
      if (fresh) { setCounts(fresh.counts); setTotal(fresh.total); }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className={styles.head}>
        <h1 className={styles.title}><Handshake size={16} /> سرنخ‌ها ({faNum(total)})</h1>
        <select className={styles.control} aria-label="وضعیت پیگیری" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">همه</option>
          {LEAD_STATUSES.map(s => (
            <option key={s} value={s}>{leadStatusLabels[s]} ({faNum(counts[s] ?? 0)})</option>
          ))}
        </select>
      </div>

      <p className={styles.explain}>
        هر ردیف یعنی یک کاربر روی صفحهٔ یک رسانه دکمهٔ «نمایش شمارهٔ تماس» را زده است.
        رسامپ معامله را انجام نمی‌دهد و خریدار مستقیم با صاحب رسانه تماس می‌گیرد،
        پس این جدول تنها ردِ تقاضایی است که پلتفرم می‌بیند: چه رسانه‌ای متقاضی دارد و چه کسی دنبالش بوده.
        <br />
        اگر همان کاربر دوباره شماره را بگیرد ردیف تازه ساخته نمی‌شود؛ شمارندهٔ «دفعات» بالا می‌رود —
        پس عدد بزرگ یعنی علاقهٔ جدی‌تر. وضعیت پیگیری و یادداشت را شما ثبت می‌کنید و
        <b> یادداشت هرگز به کاربر نشان داده نمی‌شود</b>.
      </p>

      {error && <div role="alert" className={`${form.error} ${styles.banner}`}>{error}</div>}

      {loading ? (
        <div className={styles.state}>در حال بارگذاری…</div>
      ) : error && leads.length === 0 ? (
        <div className={styles.state}><Button onClick={load}>تلاش دوباره</Button></div>
      ) : leads.length === 0 ? (
        <div className={`${styles.state} ${styles.stateRow}`}><Inbox size={16} /> هنوز درخواست تماسی ثبت نشده است</div>
      ) : (
        <div className={styles.queue}>
          {leads.map(l => {
            const busy = busyId === l.id;
            const draft = notes[l.id];
            return (
              <article key={l.id} className={styles.item}>
                <div className={styles.itemMain}>
                  <div className={styles.itemTitle}>
                    {l.billboard && <TypeIcon type={l.billboard.type} size={14} />}
                    {l.billboard
                      ? <a href={`/billboard/${l.billboard.slug}`} target="_blank" rel="noreferrer">{l.billboard.name}</a>
                      : <span>رسانهٔ حذف‌شده</span>}
                    <Badge text={leadStatusLabels[l.status] ?? l.status} tone={statusTone(l.status)} />
                    {l.count > 1 && (
                      <span className={styles.warn}><Repeat size={11} /> {faNum(l.count)} بار</span>
                    )}
                  </div>
                  <div className={styles.itemMeta}>
                    {l.billboard ? `${l.billboard.city} · ${faNum(l.billboard.price)}M تومان/ماه · صاحب رسانه: ${l.billboard.agency || "—"} ${l.billboard.phone || ""}` : "—"}<br />
                    متقاضی: <b>{l.user?.name ?? "حساب حذف‌شده"}</b>
                    {l.user?.phone ? ` (${l.user.phone})` : ""} · آخرین درخواست: {fmt(l.lastRequestedAt)}
                  </div>

                  {canEdit ? (
                    <div className={`${form.row} ${styles.noteRow}`}>
                      <textarea
                        className={styles.note}
                        value={draft ?? l.note ?? ""}
                        onChange={e => setNotes(prev => ({ ...prev, [l.id]: e.target.value }))}
                        rows={2}
                        maxLength={500}
                        aria-label="یادداشت داخلی"
                        placeholder="یادداشت داخلی (فقط برای تیم مدیریت)"
                      />
                      <Button size="sm" onClick={() => patch(l.id, { note: (draft ?? l.note ?? "").trim() })} disabled={busy || draft === undefined}>
                        <Save size={12} /> {busy ? "…" : "ذخیرهٔ یادداشت"}
                      </Button>
                    </div>
                  ) : l.note ? (
                    <div className={styles.quote}>{l.note}</div>
                  ) : null}
                </div>

                {canEdit && (
                  <div className={styles.itemSide}>
                    {LEAD_STATUSES.filter(s => s !== l.status).map(s => (
                      <button key={s} type="button" className={styles.toneButton} style={cssVar("--tone", statusTone(s))}
                        onClick={() => patch(l.id, { status: s })} disabled={busy}>
                        {busy ? "…" : `→ ${leadStatusLabels[s]}`}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
          {page < pages && (
            <Button className={styles.more} onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "در حال بارگذاری…" : `نمایش بیشتر (${faNum(Math.max(0, total - leads.length))} مورد دیگر)`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
