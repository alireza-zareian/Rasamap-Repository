"use client";
import { useState, useEffect, useCallback } from "react";
import { C } from "./constants";
import { Badge } from "./Badge";
import { TypeIcon } from "@/components/TypeIcon";
import { leadStatusLabels, LEAD_STATUSES } from "@/lib/types";
import { Handshake, Inbox, Repeat, Save } from "lucide-react";
import { faNum } from "@/lib/format";

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

const STATUS_TONE: Record<string, [string, string]> = {
  new:       ["var(--accent)", "rgba(59,123,245,0.12)"],
  contacted: ["#f59e0b",       "rgba(245,158,11,0.12)"],
  closed:    [C.green,         "rgba(34,197,94,0.12)"],
};

const fmt = (d: string) => new Date(d).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric" });

/**
 * Leads — who asked for which media owner's phone number.
 *
 * Rasamap hands the deal off at the phone number (there is no booking — §17),
 * so this is the whole demand-side record the platform has. Rows are created by
 * POST /api/billboards/[slug]/contact and are never written by hand here: an
 * admin only moves the follow-up state and keeps an internal memo.
 */
export function LeadsPanel({ canEdit }: { canEdit: boolean }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/admin/leads?status=${filter}&limit=50`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "خطا در دریافت سرنخ‌ها"); setLeads([]); return; }
      setLeads(data.leads ?? []);
      setCounts(data.counts ?? {});
      setTotal(data.total ?? 0);
    } catch {
      setError("خطای شبکه");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const patch = async (id: number, body: { status?: string; note?: string }) => {
    if (busyId) return;                        // one write in flight at a time
    setBusyId(id); setError("");
    try {
      const res = await fetch(`/api/admin/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "خطا در ثبت تغییر"); return; }

      const saved: Lead = data.lead;
      // A status change can move the row out of the current filter — drop it
      // rather than leaving a row on screen that the filter no longer matches.
      if (filter && saved.status !== filter) setLeads(prev => prev.filter(l => l.id !== id));
      else setLeads(prev => prev.map(l => (l.id === id ? saved : l)));
      setNotes(prev => { const n = { ...prev }; delete n[id]; return n; });

      // The per-status counts changed; re-read them rather than guessing.
      const fresh = await fetch(`/api/admin/leads?status=${filter}&limit=1`).then(r => r.ok ? r.json() : null).catch(() => null);
      if (fresh) { setCounts(fresh.counts ?? {}); setTotal(fresh.total ?? 0); }
    } catch {
      setError("خطای شبکه");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.9rem", fontWeight: 700 }}>
          <Handshake size={16} /> سرنخ‌ها ({faNum(total)})
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: C.font, fontSize: "0.8rem", padding: "7px 10px", borderRadius: 8, outline: "none" }}>
          <option value="">همه</option>
          {LEAD_STATUSES.map(s => (
            <option key={s} value={s}>{leadStatusLabels[s]} ({counts[s] ?? 0})</option>
          ))}
        </select>
      </div>

      <div style={{ fontSize: "0.75rem", color: C.muted, lineHeight: 1.9, marginBottom: 16, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
        هر ردیف یعنی یک کاربر روی صفحهٔ یک رسانه دکمهٔ «نمایش شمارهٔ تماس» را زده است.
        رساماپ معامله را انجام نمی‌دهد و خریدار مستقیم با صاحب رسانه تماس می‌گیرد،
        پس این جدول تنها ردِ تقاضایی است که پلتفرم می‌بیند: چه رسانه‌ای متقاضی دارد و چه کسی دنبالش بوده.
        <br />
        اگر همان کاربر دوباره شماره را بگیرد ردیف تازه ساخته نمی‌شود؛ شمارندهٔ «دفعات» بالا می‌رود —
        پس عدد بزرگ یعنی علاقهٔ جدی‌تر. وضعیت پیگیری و یادداشت را شما ثبت می‌کنید و
        <b> یادداشت هرگز به کاربر نشان داده نمی‌شود</b>.
      </div>

      {error && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "9px 14px", fontSize: "0.8rem", color: "#ef4444", marginBottom: 12 }}>{error}</div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontSize: "0.85rem" }}>در حال بارگذاری...</div>
      ) : leads.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "48px 0", color: C.muted, fontSize: "0.85rem" }}>
          <Inbox size={16} /> هنوز درخواست تماسی ثبت نشده است
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {leads.map(l => {
            const [tone, toneBg] = STATUS_TONE[l.status] ?? [C.muted, C.surface];
            const busy = busyId === l.id;
            return (
              <div key={l.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" }}>
                      {l.billboard && <TypeIcon type={l.billboard.type} size={14} />}
                      <a href={l.billboard ? `/billboard/${l.billboard.slug}` : "#"} target="_blank" rel="noreferrer"
                        style={{ fontSize: "0.88rem", fontWeight: 700, color: C.text, textDecoration: "none" }}>
                        {l.billboard?.name ?? "رسانهٔ حذف‌شده"}
                      </a>
                      <Badge text={leadStatusLabels[l.status] ?? l.status} color={tone} bg={toneBg} />
                      {l.count > 1 && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.68rem", color: C.yellow }}>
                          <Repeat size={11} /> {faNum(l.count)} بار
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: C.muted, lineHeight: 1.9 }}>
                      {l.billboard ? `${l.billboard.city} · ${faNum(l.billboard.price)}M تومان/ماه · صاحب رسانه: ${l.billboard.agency || "—"} ${l.billboard.phone || ""}` : "—"}<br />
                      متقاضی: <b style={{ color: C.text }}>{l.user?.name ?? "حساب حذف‌شده"}</b>
                      {l.user?.phone ? ` (${l.user.phone})` : ""} · آخرین درخواست: {fmt(l.lastRequestedAt)}
                    </div>

                    {canEdit ? (
                      <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                        <textarea
                          value={notes[l.id] ?? l.note ?? ""}
                          onChange={e => setNotes(prev => ({ ...prev, [l.id]: e.target.value }))}
                          rows={2}
                          maxLength={500}
                          placeholder="یادداشت داخلی (فقط برای تیم مدیریت)"
                          style={{ flex: 1, minWidth: 200, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: C.font, fontSize: "0.75rem", lineHeight: 1.8, padding: "8px 10px", borderRadius: 8, outline: "none", resize: "vertical" }}
                        />
                        <button onClick={() => patch(l.id, { note: (notes[l.id] ?? l.note ?? "").trim() })} disabled={busy || notes[l.id] === undefined}
                          style={{ background: "none", border: `1px solid ${C.border}`, color: notes[l.id] === undefined ? C.muted : C.accent, fontFamily: C.font, fontSize: "0.75rem", fontWeight: 600, padding: "8px 12px", borderRadius: 8, cursor: busy || notes[l.id] === undefined ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
                          <Save size={12} /> {busy ? "..." : "ذخیرهٔ یادداشت"}
                        </button>
                      </div>
                    ) : l.note ? (
                      <div style={{ fontSize: "0.73rem", color: C.muted, marginTop: 8, background: C.surface, borderRadius: 8, padding: "8px 10px", lineHeight: 1.8 }}>{l.note}</div>
                    ) : null}
                  </div>

                  {canEdit && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                      {LEAD_STATUSES.filter(s => s !== l.status).map(s => {
                        const [t] = STATUS_TONE[s] ?? [C.muted];
                        return (
                          <button key={s} onClick={() => patch(l.id, { status: s })} disabled={busy}
                            style={{ background: "none", border: `1px solid ${t}55`, color: t, fontFamily: C.font, fontSize: "0.76rem", fontWeight: 600, padding: "7px 14px", borderRadius: 8, cursor: busy ? "default" : "pointer", whiteSpace: "nowrap" }}>
                            {busy ? "..." : `→ ${leadStatusLabels[s]}`}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
