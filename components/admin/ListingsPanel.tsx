"use client";
import { useState, useEffect, useCallback } from "react";
import { C, STATUS_LABEL } from "./constants";
import { Badge } from "./Badge";
import { TypeIcon } from "@/components/TypeIcon";
import { planLabels } from "@/lib/types";
import { ClipboardCheck, Check, X, Sparkles, ImageOff, PencilLine } from "lucide-react";
import { faNum } from "@/lib/format";

interface Listing {
  id: number;
  name: string;
  city: string;
  region: string;
  location: string;
  type: string;
  price: number;
  width: number;
  height: number;
  faces: number;
  status: string;
  plan: string;
  featured: boolean;
  images: string[];
  description: string;
  phone: string;
  createdAt: string;
  reviewNote: string | null;
  submittedBy: { id: number; name: string; phone: string } | null;
}

type Decision = "approve" | "reject" | "revision";

const STATUS_TONE: Record<string, [string, string]> = {
  pending:          ["#f59e0b", "rgba(245,158,11,0.12)"],
  awaiting_payment: ["#8b5cf6", "rgba(139,92,246,0.12)"],
  needs_revision:   ["#f97316", "rgba(249,115,22,0.12)"],
};

/**
 * The approval queue for user-submitted media.
 *
 * Everything shown here is live from /api/admin/listings; a decision goes to
 * /api/admin/listings/[id]/decision, which is the only place the status
 * transition is allowed to happen. `canDecide` mirrors the server-side rule
 * (admin+) so the buttons match what the API will actually accept.
 */
export function ListingsPanel({ canDecide }: { canDecide: boolean }) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  // Per-listing message to the submitter. Required for "reject" and "revision".
  const [notes, setNotes] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/listings?status=${filter}&limit=50`);
      const data = await res.json();
      setListings(res.ok ? (data.listings ?? []) : []);
      if (!res.ok) setError(data.error ?? "خطا در دریافت آگهی‌ها");
    } catch {
      setError("خطای شبکه");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const decide = async (id: number, decision: Decision) => {
    if (busyId) return;                       // one decision in flight at a time
    const note = (notes[id] ?? "").trim();
    if (decision !== "approve" && !note) {
      setError("برای «رد» یا «نیاز به اصلاح» باید توضیحی برای فرستنده بنویسید.");
      return;
    }
    setBusyId(id); setError("");
    try {
      const res = await fetch(`/api/admin/listings/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "خطا در ثبت تصمیم"); return; }
      // The row has left the queue — drop it rather than refetching everything.
      setListings(prev => prev.filter(l => l.id !== id));
      setNotes(prev => { const next = { ...prev }; delete next[id]; return next; });
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
          <ClipboardCheck size={16} /> تأیید آگهی‌ها
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: C.font, fontSize: "0.8rem", padding: "7px 10px", borderRadius: 8, outline: "none" }}>
          <option value="">همه در انتظار</option>
          <option value="pending">در انتظار تأیید</option>
          <option value="awaiting_payment">در انتظار پرداخت</option>
          <option value="needs_revision">نیاز به اصلاح</option>
        </select>
      </div>

      <div style={{ fontSize: "0.75rem", color: C.muted, lineHeight: 1.9, marginBottom: 16, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
        رسانه‌هایی که کاربران از طریق «ثبت رسانه» فرستاده‌اند و هنوز منتشر نشده‌اند.
        تا وقتی تأیید نشوند در جستجو، نقشه، آمار و نقشهٔ سایت دیده نمی‌شوند.
        آگهی با پلن <b>ویژه</b> در وضعیت «در انتظار پرداخت» است: پس از دریافت وجه،
        با زدن «تأیید و انتشار» هم منتشر می‌شود و هم نشان ویژه می‌گیرد.
        درگاه پرداخت آنلاین نداریم؛ تأیید مالی دستی و توسط ادمین انجام می‌شود.
        <br />
        سه تصمیم ممکن است: <b>تأیید و انتشار</b> (توضیح اختیاری)، <b>نیاز به اصلاح</b>
        (آگهی به فرستنده برمی‌گردد تا ویرایش و دوباره ارسال کند) و <b>رد</b>.
        برای «نیاز به اصلاح» و «رد» نوشتن توضیح برای فرستنده الزامی است.
      </div>

      {error && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "9px 14px", fontSize: "0.8rem", color: "#ef4444", marginBottom: 12 }}>{error}</div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontSize: "0.85rem" }}>در حال بارگذاری...</div>
      ) : listings.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "48px 0", color: C.muted, fontSize: "0.85rem" }}>
          <Check size={16} /> آگهی در انتظار بررسی وجود ندارد
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {listings.map(l => {
            const [tone, toneBg] = STATUS_TONE[l.status] ?? [C.muted, C.surface];
            const busy = busyId === l.id;
            return (
              <div key={l.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "flex", gap: 12, padding: 14, flexWrap: "wrap" }}>
                  {/* Submitted photos — an admin has to see these before publishing */}
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {l.images.length === 0 ? (
                      <div style={{ width: 84, height: 84, borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: C.muted, fontSize: "0.62rem" }}>
                        <ImageOff size={16} /> بدون تصویر
                      </div>
                    ) : l.images.slice(0, 3).map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={src} alt="" loading="lazy" decoding="async" onClick={() => setLightbox(src)}
                        style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}`, cursor: "zoom-in" }} />
                    ))}
                  </div>

                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" }}>
                      <TypeIcon type={l.type} size={14} />
                      <span style={{ fontSize: "0.88rem", fontWeight: 700 }}>{l.name}</span>
                      <Badge text={STATUS_LABEL[l.status] ?? l.status} color={tone} bg={toneBg} />
                      {l.plan === "featured" && (
                        <Badge text={`پلن ${planLabels.featured}`} color="#f59e0b" bg="rgba(245,158,11,0.12)" />
                      )}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: C.muted, lineHeight: 1.9 }}>
                      {l.city}{l.region ? ` · ${l.region}` : ""} · {l.location}<br />
                      {l.width}×{l.height} متر · {l.faces} وجه · {faNum(l.price)}M تومان/ماه<br />
                      فرستنده: {l.submittedBy ? `${l.submittedBy.name} (${l.submittedBy.phone})` : "نامشخص"} · {new Date(l.createdAt).toLocaleDateString("fa-IR")}
                    </div>
                    {l.description && (
                      <div style={{ fontSize: "0.75rem", color: C.muted, marginTop: 8, lineHeight: 1.8, background: C.surface, borderRadius: 8, padding: "8px 10px" }}>
                        {l.description.slice(0, 400)}
                      </div>
                    )}
                    {l.reviewNote && (
                      <div style={{ fontSize: "0.72rem", color: "#f97316", marginTop: 8, lineHeight: 1.8, background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.25)", borderRadius: 8, padding: "8px 10px" }}>
                        توضیح قبلی برای فرستنده: {l.reviewNote}
                      </div>
                    )}
                    {canDecide && (
                      <textarea
                        value={notes[l.id] ?? ""}
                        onChange={e => setNotes(prev => ({ ...prev, [l.id]: e.target.value }))}
                        rows={2}
                        maxLength={1000}
                        placeholder="توضیح برای فرستنده (برای «نیاز به اصلاح» و «رد» الزامی، برای «تأیید» اختیاری)"
                        style={{ width: "100%", marginTop: 8, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: C.font, fontSize: "0.75rem", lineHeight: 1.8, padding: "8px 10px", borderRadius: 8, outline: "none", resize: "vertical" }}
                      />
                    )}
                  </div>

                  {canDecide && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, justifyContent: "center" }}>
                      <button onClick={() => decide(l.id, "approve")} disabled={busy}
                        style={{ background: busy ? C.border : C.green, border: "none", color: "#fff", fontFamily: C.font, fontSize: "0.78rem", fontWeight: 700, padding: "9px 16px", borderRadius: 8, cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                        {l.plan === "featured" ? <Sparkles size={13} /> : <Check size={13} />}
                        {busy ? "..." : l.plan === "featured" ? "تأیید پرداخت و انتشار" : "تأیید و انتشار"}
                      </button>
                      <button onClick={() => decide(l.id, "revision")} disabled={busy}
                        style={{ background: "none", border: "1px solid rgba(249,115,22,0.5)", color: "#f97316", fontFamily: C.font, fontSize: "0.78rem", fontWeight: 600, padding: "8px 16px", borderRadius: 8, cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                        <PencilLine size={13} /> نیاز به اصلاح
                      </button>
                      <button onClick={() => decide(l.id, "reject")} disabled={busy}
                        style={{ background: "none", border: `1px solid ${C.border}`, color: "#ef4444", fontFamily: C.font, fontSize: "0.78rem", fontWeight: 600, padding: "8px 16px", borderRadius: 8, cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                        <X size={13} /> رد
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(6,10,18,0.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 12 }} />
        </div>
      )}
    </div>
  );
}
