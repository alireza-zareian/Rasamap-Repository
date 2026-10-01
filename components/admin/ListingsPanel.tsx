"use client";
import { useState, useEffect, useCallback } from "react";
import { fetchJson, FetchError, errorMessage } from "@/lib/client/fetch-json";
import { Lightbox } from "./Lightbox";
import { MODERATION_LABEL, moderationTone } from "./constants";
import { Badge } from "./Badge";
import { TypeIcon } from "@/components/media/TypeIcon";
import { planLabels } from "@/lib/types";
import { ClipboardCheck, Check, X, Sparkles, ImageOff, PencilLine } from "lucide-react";
import { faNum, faMillions } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { cssVar } from "@/components/ui/css-var";
import form from "@/components/ui/form.module.css";
import styles from "./admin.module.css";
import own from "./ListingsPanel.module.css";

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
 * The approval queue. Decisions go to /api/admin/listings/[id]/decision;
 * `canDecide` mirrors the server's admin-and-above rule, so the buttons match
 * what the API accepts.
 */
export function ListingsPanel({ canDecide }: { canDecide: boolean }) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  // Paged: newest first, so without paging the longest-waiting were unreachable.
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
      // A decision shifts the offsets, so an id can come round again; show it once.
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
      <div className={styles.head}>
        <h1 className={styles.title}><ClipboardCheck size={16} /> تأیید آگهی‌ها ({faNum(total)})</h1>
        <select className={styles.control} aria-label="وضعیت بررسی" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">همه در انتظار</option>
          <option value="pending">در انتظار تأیید</option>
          <option value="awaiting_payment">در انتظار پرداخت</option>
          <option value="needs_revision">نیاز به اصلاح</option>
          <option value="rejected">رد شده</option>
        </select>
      </div>

      <p className={styles.explain}>
        رسانه‌هایی که کاربران از طریق «ثبت رسانه» فرستاده‌اند و هنوز منتشر نشده‌اند.
        تا وقتی تأیید نشوند در جستجو، نقشه، آمار و نقشهٔ سایت دیده نمی‌شوند.
        آگهی با پلن <b>ویژه</b> در وضعیت «در انتظار پرداخت» است: پس از دریافت وجه،
        با زدن «تأیید و انتشار» هم منتشر می‌شود و هم نشان ویژه می‌گیرد.
        درگاه پرداخت آنلاین نداریم؛ تأیید مالی دستی و توسط ادمین انجام می‌شود.
        <br />
        سه تصمیم ممکن است: <b>تأیید و انتشار</b> (توضیح اختیاری)، <b>نیاز به اصلاح</b>
        (آگهی به فرستنده برمی‌گردد تا ویرایش و دوباره ارسال کند) و <b>رد</b>.
        برای «نیاز به اصلاح» و «رد» نوشتن توضیح برای فرستنده الزامی است.
      </p>

      {error && <div role="alert" className={`${form.error} ${styles.banner}`}>{error}</div>}

      {loading ? (
        <div className={styles.state}>در حال بارگذاری…</div>
      ) : error && listings.length === 0 ? (
        <div className={styles.state}><Button onClick={load}>تلاش دوباره</Button></div>
      ) : listings.length === 0 ? (
        <div className={`${styles.state} ${styles.stateRow}`}><Check size={16} /> آگهی در انتظار بررسی وجود ندارد</div>
      ) : (
        <div className={styles.queue}>
          {listings.map(l => {
            const busy = busyId === l.id;
            // All buttons wait while any decision is in flight, rather than silently no-op.
            const anyBusy = busyId !== null;
            return (
              <article key={l.id} className={styles.item}>
                {/* The submitted photos, to see before publishing. */}
                <div className={own.photos}>
                  {l.images.length === 0 ? (
                    <div className={own.noPhoto}><ImageOff size={16} /> بدون تصویر</div>
                  ) : l.images.slice(0, 3).map((src, i) => (
                    // A button, so the keyboard can open each photo.
                    <button key={i} type="button" className={own.photo} onClick={() => setLightbox(src)}
                      aria-label={`بزرگ‌نمایی تصویر ${i + 1} از ${l.name}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" loading="lazy" decoding="async" />
                    </button>
                  ))}
                </div>

                <div className={styles.itemMain}>
                  <div className={styles.itemTitle}>
                    <TypeIcon type={l.type} size={14} />
                    <span>{l.name}</span>
                    <Badge text={MODERATION_LABEL[l.moderation] ?? l.moderation} tone={moderationTone(l.moderation)} />
                    {l.plan === "featured" && <Badge text={`پلن ${planLabels.featured}`} tone="#f59e0b" />}
                  </div>
                  <div className={styles.itemMeta}>
                    {l.city}{l.region ? ` · ${l.region}` : ""} · {l.location}<br />
                    {faNum(l.width)}×{faNum(l.height)} متر · {faNum(l.faces)} وجه · {faMillions(l.price)} تومان/ماه<br />
                    فرستنده: {l.submittedBy ? <>{l.submittedBy.name} (<span className={own.ltr}>{l.submittedBy.phone}</span>)</> : "نامشخص"} · {new Date(l.createdAt).toLocaleDateString("fa-IR")}<br />
                    {/* The number buyers will get. Only the submitter's own was proven
                        by a code; any other could be a stranger's, so it is flagged. */}
                    شماره تماس آگهی: <span className={own.ltr}>{l.phone}</span>{" "}
                    {l.submittedBy?.phone === l.phone
                      ? <Badge text="شمارهٔ تأییدشدهٔ فرستنده" tone="var(--green)" />
                      : <Badge text="تأییدنشده — پیش از تأیید تماس بگیرید" tone="#f59e0b" />}
                  </div>
                  {l.description && <div className={styles.quote}>{l.description.slice(0, 400)}</div>}
                  {l.reviewNote && <div className={own.previous}>توضیح قبلی برای فرستنده: {l.reviewNote}</div>}
                  {canDecide && (
                    <textarea
                      className={`${styles.note} ${own.noteBox}`}
                      value={notes[l.id] ?? ""}
                      onChange={e => setNotes(prev => ({ ...prev, [l.id]: e.target.value }))}
                      rows={2}
                      maxLength={1000}
                      aria-label={`توضیح برای فرستندهٔ ${l.name}`}
                      placeholder="توضیح برای فرستنده (برای «نیاز به اصلاح» و «رد» الزامی، برای «تأیید» اختیاری)"
                    />
                  )}
                </div>

                {canDecide && (
                  <div className={styles.itemSide}>
                    <button type="button" className={`${styles.toneButton} ${styles.solid}`} style={cssVar("--tone", "var(--green)")}
                      onClick={() => decide(l.id, l.updatedAt, "approve")} disabled={anyBusy}>
                      {l.plan === "featured" ? <Sparkles size={13} /> : <Check size={13} />}
                      {busy ? "…" : l.plan === "featured" ? "تأیید پرداخت و انتشار" : "تأیید و انتشار"}
                    </button>
                    <button type="button" className={styles.toneButton} style={cssVar("--tone", "#f97316")}
                      onClick={() => decide(l.id, l.updatedAt, "revision")} disabled={anyBusy}>
                      <PencilLine size={13} /> نیاز به اصلاح
                    </button>
                    <button type="button" className={styles.toneButton} style={cssVar("--tone", "var(--red)")}
                      onClick={() => decide(l.id, l.updatedAt, "reject")} disabled={anyBusy}>
                      <X size={13} /> رد
                    </button>
                  </div>
                )}
              </article>
            );
          })}
          {page < pages && (
            <Button className={styles.more} onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "در حال بارگذاری…" : `نمایش بیشتر (${faNum(total - listings.length)} مورد دیگر)`}
            </Button>
          )}
        </div>
      )}

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
