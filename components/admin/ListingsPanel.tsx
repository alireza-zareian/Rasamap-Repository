"use client";
import { useState, useEffect, useCallback } from "react";
import { fetchJson, FetchError, errorMessage } from "@/lib/client/fetch-json";
import { Lightbox } from "./Lightbox";
import { C, MODERATION_COLOR, MODERATION_LABEL } from "./constants";
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
  moderation: string;
  plan: string;
  featured: boolean;
  images: string[];
  description: string;
  phone: string;
  createdAt: string;
  /** Sent back with a decision, so it lands only on the version shown here. */
  updatedAt: string;
  reviewNote: string | null;
  submittedBy: { id: number; name: string; phone: string } | null;
}

type Decision = "approve" | "reject" | "revision";

const PAGE_SIZE = 50;

/**
 * The approval queue for user-submitted media.
 *
 * Everything shown here is live from /api/admin/listings; a decision goes to
 * /api/admin/listings/[id]/decision, which is the only place a review state
 * is allowed to change. `canDecide` mirrors the server-side rule
 * (admin+) so the buttons match what the API will actually accept.
 */
export function ListingsPanel({ canDecide }: { canDecide: boolean }) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  // The queue is paged. It used to fetch the first 50 and stop, and since it is
  // newest first, the oldest submissions — the ones waiting longest — were the
  // ones no reviewer could reach.
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  // Per-listing message to the submitter. Required for "reject" and "revision".
  const [notes, setNotes] = useState<Record<number, string>>({});

  type QueuePage = { listings: Listing[]; total: number; page: number; pages: number };
  const fetchPage = useCallback(
    (n: number) => fetchJson<QueuePage>(`/api/admin/listings?moderation=${filter}&limit=${PAGE_SIZE}&page=${n}`),
    [filter],
  );

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await fetchPage(1);
      setListings(data.listings); setTotal(data.total); setPage(1); setPages(data.pages);
    } catch (err) {
      setListings([]); setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true); setError("");
    try {
      const data = await fetchPage(page + 1);
      // A decision since the last page shifted the offsets, so an id already
      // on screen can come round again; it is shown once.
      setListings(prev => [...prev, ...data.listings.filter(l => !prev.some(p => p.id === l.id))]);
      setTotal(data.total); setPage(page + 1); setPages(data.pages);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const decide = async (id: number, seen: string, decision: Decision) => {
    if (busyId) return;                       // one decision in flight at a time
    const note = (notes[id] ?? "").trim();
    if (decision !== "approve" && !note) {
      setError("برای «رد» یا «نیاز به اصلاح» باید توضیحی برای فرستنده بنویسید.");
      return;
    }
    setBusyId(id); setError("");
    try {
      await fetchJson(`/api/admin/listings/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note || undefined, seen }),
      });
      // The row has left the queue — drop it rather than refetching everything.
      setListings(prev => prev.filter(l => l.id !== id));
      setTotal(t => Math.max(0, t - 1));
      setNotes(prev => { const next = { ...prev }; delete next[id]; return next; });
    } catch (err) {
      setError(errorMessage(err));
      // The submitter changed it in the meantime: show the new version.
      if (err instanceof FetchError && err.status === 409) load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.9rem", fontWeight: 700 }}>
          <ClipboardCheck size={16} /> تأیید آگهی‌ها ({faNum(total)})
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: C.font, fontSize: "0.8rem", padding: "7px 10px", borderRadius: 8, outline: "none" }}>
          <option value="">همه در انتظار</option>
          <option value="pending">در انتظار تأیید</option>
          <option value="awaiting_payment">در انتظار پرداخت</option>
          <option value="needs_revision">نیاز به اصلاح</option>
          <option value="rejected">رد شده</option>
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
      ) : error && listings.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0" }}>
          <button onClick={load} style={{ background: "none", border: `1px solid ${C.border}`, color: C.text, fontFamily: C.font, fontSize: "0.8rem", padding: "8px 18px", borderRadius: 8, cursor: "pointer" }}>تلاش دوباره</button>
        </div>
      ) : listings.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "48px 0", color: C.muted, fontSize: "0.85rem" }}>
          <Check size={16} /> آگهی در انتظار بررسی وجود ندارد
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {listings.map(l => {
            const [tone, toneBg] = MODERATION_COLOR[l.moderation] ?? [C.muted, C.surface];
            const busy = busyId === l.id;
            // Disabling only the busy row's own buttons left every other row's
            // decide buttons clickable while a decision was in flight — clicking
            // one did nothing (decide() no-ops when busyId is already set), with
            // no feedback, which reads as a broken button during a live demo.
            const anyBusy = busyId !== null;
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
                      // A button, not a clickable <img>: reviewing the photos is
                      // the whole job on this screen, and nothing about an image
                      // with an onClick reaches the tab order.
                      <button
                        key={i}
                        type="button"
                        onClick={() => setLightbox(src)}
                        aria-label={`بزرگ‌نمایی تصویر ${i + 1} از ${l.name}`}
                        style={{ padding: 0, border: "none", background: "none", borderRadius: 8, cursor: "zoom-in", lineHeight: 0 }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" loading="lazy" decoding="async"
                          style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}`, display: "block" }} />
                      </button>
                    ))}
                  </div>

                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" }}>
                      <TypeIcon type={l.type} size={14} />
                      <span style={{ fontSize: "0.88rem", fontWeight: 700 }}>{l.name}</span>
                      <Badge text={MODERATION_LABEL[l.moderation] ?? l.moderation} color={tone} bg={toneBg} />
                      {l.plan === "featured" && (
                        <Badge text={`پلن ${planLabels.featured}`} color="#f59e0b" bg="rgba(245,158,11,0.12)" />
                      )}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: C.muted, lineHeight: 1.9 }}>
                      {l.city}{l.region ? ` · ${l.region}` : ""} · {l.location}<br />
                      {l.width}×{l.height} متر · {l.faces} وجه · {faNum(l.price)}M تومان/ماه<br />
                      فرستنده: {l.submittedBy ? `${l.submittedBy.name} (${l.submittedBy.phone})` : "نامشخص"} · {new Date(l.createdAt).toLocaleDateString("fa-IR")}<br />
                      {/* The number buyers will be handed. Nobody verified it unless it
                          is the submitter's own, which their sign-up code proved — any
                          other one could be a stranger's, so the reviewer is told. */}
                      شماره تماس آگهی: <span style={{ direction: "ltr", display: "inline-block" }}>{l.phone}</span>{" "}
                      {l.submittedBy?.phone === l.phone
                        ? <Badge text="شمارهٔ تأییدشدهٔ فرستنده" color="#22c55e" bg="rgba(34,197,94,0.12)" />
                        : <Badge text="تأییدنشده — پیش از تأیید تماس بگیرید" color="#f59e0b" bg="rgba(245,158,11,0.12)" />}
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
                      <button onClick={() => decide(l.id, l.updatedAt, "approve")} disabled={anyBusy}
                        style={{ background: anyBusy ? C.border : C.green, border: "none", color: "#fff", fontFamily: C.font, fontSize: "0.78rem", fontWeight: 700, padding: "9px 16px", borderRadius: 8, cursor: anyBusy ? "default" : "pointer", opacity: anyBusy && !busy ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                        {l.plan === "featured" ? <Sparkles size={13} /> : <Check size={13} />}
                        {busy ? "..." : l.plan === "featured" ? "تأیید پرداخت و انتشار" : "تأیید و انتشار"}
                      </button>
                      <button onClick={() => decide(l.id, l.updatedAt, "revision")} disabled={anyBusy}
                        style={{ background: "none", border: "1px solid rgba(249,115,22,0.5)", color: "#f97316", fontFamily: C.font, fontSize: "0.78rem", fontWeight: 600, padding: "8px 16px", borderRadius: 8, cursor: anyBusy ? "default" : "pointer", opacity: anyBusy && !busy ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                        <PencilLine size={13} /> نیاز به اصلاح
                      </button>
                      <button onClick={() => decide(l.id, l.updatedAt, "reject")} disabled={anyBusy}
                        style={{ background: "none", border: `1px solid ${C.border}`, color: "#ef4444", fontFamily: C.font, fontSize: "0.78rem", fontWeight: 600, padding: "8px 16px", borderRadius: 8, cursor: anyBusy ? "default" : "pointer", opacity: anyBusy && !busy ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                        <X size={13} /> رد
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {page < pages && (
            <button onClick={loadMore} disabled={loadingMore} style={{ alignSelf: "center", background: "none", border: `1px solid ${C.border}`, color: C.text, fontFamily: C.font, fontSize: "0.8rem", padding: "9px 22px", borderRadius: 8, cursor: loadingMore ? "default" : "pointer" }}>
              {loadingMore ? "در حال بارگذاری..." : `نمایش بیشتر (${faNum(total - listings.length)} مورد دیگر)`}
            </button>
          )}
        </div>
      )}

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
