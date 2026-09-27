"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/lib/client/use-current-user";
import { faNum } from "@/lib/format";
import { fetchJson, errorMessage } from "@/lib/client/fetch-json";
import { Star, MessageSquare, Send, Check, Pencil, Trash2, X, CornerDownLeft, ShieldCheck } from "lucide-react";
import { hasRole, isStaffRole } from "@/lib/domain/roles";
import { Button } from "@/components/ui/Button";
import form from "@/components/ui/form.module.css";
import styles from "./ReviewsSection.module.css";
import reveal from "@/components/ui/reveal.module.css";

interface Reply {
  id: number;
  userId: number | null;   // null for a staff reply — see the ReviewReply model
  authorName: string;
  isStaff: boolean;
  body: string;
  createdAt: string;
}

interface Review {
  id: number;
  userId: number;
  rating: number;
  comment: string;
  createdAt: string;
  user: { name: string };
  replies: Reply[];
}

interface Props { billboardId: number; }

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className={styles.stars}>
      {[1,2,3,4,5].map(n => {
        const active = n <= (hover || value);
        return (
          <button
            key={n}
            type="button"
            className={styles.star}
            data-on={active || undefined}
            onClick={() => onChange?.(n)}
            onMouseEnter={() => onChange && setHover(n)}
            onMouseLeave={() => onChange && setHover(0)}
            // Read-only when there is no onChange — it is then a rating being
            // displayed, not asked for, so it leaves the tab order rather than
            // offering five stops that do nothing.
            aria-label={`${n} ستاره از ۵`}
            aria-pressed={onChange ? n === value : undefined}
            disabled={!onChange}
          >
            <Star size={17} fill={active ? "currentColor" : "none"} />
          </button>
        );
      })}
    </div>
  );
}

export default function ReviewsSection({ billboardId }: Props) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [avg, setAvg] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const pathname = usePathname();

  // Form state
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Reply state, keyed by the review being answered — only one box is open at a
  // time, but the draft has to survive while the request is in flight.
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [busyReplyId, setBusyReplyId] = useState<number | null>(null);

  // A failure is shown, not swallowed: an empty catch here used to answer a
  // server error with "no reviews yet — be the first", which is a false
  // statement about the media rather than a message about the request.
  const fetchReviews = useCallback(() => {
    fetchJson<{ reviews?: Review[]; avg: number | null; total: number }>(`/api/reviews?billboardId=${billboardId}`)
      .then(d => { setReviews(d.reviews ?? []); setAvg(d.avg); setTotal(d.total); setLoadError(""); })
      .catch(err => setLoadError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [billboardId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // The signed-in account comes from the shared provider rather than a fourth
  // copy of the same request: this component sits on the media page beside
  // StaffBar, Topbar and BillboardContact, and all four used to ask separately.
  // The shape differs — this file wants a numeric id to match review.userId
  // against — so it is narrowed here rather than at the source.
  const { user: currentUser } = useCurrentUser();
  const user = currentUser
    ? {
        id: Number(currentUser.id),
        name: currentUser.name,
        isStaff: !!currentUser.isStaff,
        // An editor or above may remove any review; the server checks the same.
        canModerate: !!currentUser.isStaff && isStaffRole(currentUser.role) && hasRole(currentUser.role, "editor"),
      }
    : currentUser;   // null when signed out, undefined while still asking

  // One review per account per media (a unique index enforces it), so there is
  // at most one of these — it is what the edit and delete buttons act on.
  const mine = user && !user.isStaff ? reviews.find(r => r.userId === user.id) ?? null : null;

  const startEdit = () => {
    if (!mine) return;
    setRating(mine.rating);
    setComment(mine.comment);
    setEditing(true);
    setSuccess(false);
    setError("");
  };

  const cancelEdit = () => {
    setEditing(false);
    setRating(0);
    setComment("");
    setError("");
  };

  const handleDelete = async (id: number) => {
    if (deletingId) return;                       // one delete in flight at a time
    setDeletingId(id); setError("");
    try {
      await fetchJson(`/api/reviews/${id}`, { method: "DELETE" });
      cancelEdit();
      setSuccess(false);
      fetchReviews();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  const openReply = (reviewId: number) => {
    setReplyTo(reviewId);
    setReplyBody("");
    setError("");
  };

  const sendReply = async (reviewId: number) => {
    if (replyBusy) return;
    const body = replyBody.trim();
    if (body.length < 2) { setError("پاسخ خیلی کوتاه است"); return; }
    setReplyBusy(true); setError("");
    try {
      await fetchJson(`/api/reviews/${reviewId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      setReplyTo(null); setReplyBody("");
      fetchReviews();
    } catch (err) { setError(errorMessage(err)); }
    finally { setReplyBusy(false); }
  };

  const deleteReply = async (reviewId: number, replyId: number) => {
    if (busyReplyId) return;
    setBusyReplyId(replyId); setError("");
    try {
      await fetchJson(`/api/reviews/${reviewId}/replies/${replyId}`, { method: "DELETE" });
      fetchReviews();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusyReplyId(null); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) { setError("لطفاً امتیاز را انتخاب کنید"); return; }
    if (comment.length < 10) { setError("نظر باید حداقل ۱۰ کاراکتر باشد"); return; }
    setError(""); setSubmitting(true);
    try {
      await fetchJson("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billboardId, rating, comment }),
      });
      setSuccess(true);
      setEditing(false);
      setComment(""); setRating(0);
      fetchReviews();
    } catch (err) { setError(errorMessage(err)); }
    finally { setSubmitting(false); }
  };

  // The form is on screen either to write a first review or to edit the one
  // this account already left. Named once so the error banner below can ask the
  // opposite question without repeating the expression.
  const formOpen = !!user && (editing || (!mine && !success));

  const date = (iso: string) => new Date(iso).toLocaleDateString("fa-IR");

  return (
    <section className={`${styles.section} ${reveal.reveal}`}>
      <div className={styles.head}>
        <h2 className={styles.title}><MessageSquare size={16} /> نظرات و امتیاز</h2>
        {avg !== null && (
          <div className={styles.summary}>
            <StarRating value={Math.round(avg)} />
            <span className={styles.average}>{faNum(avg)}</span>
            <span className={styles.count}>({faNum(total)} نظر)</span>
          </div>
        )}
      </div>

      {formOpen && (
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formHead}>
            <span>{editing ? "ویرایش نظر شما" : "ثبت نظر شما"}</span>
            {editing && <button type="button" className={styles.link} onClick={cancelEdit}><X size={12} /> انصراف</button>}
          </div>
          <div className={styles.ratingRow}>
            <span>امتیاز:</span>
            <StarRating value={rating} onChange={setRating} />
          </div>
          <textarea
            className={form.input}
            value={comment} onChange={e => setComment(e.target.value)}
            placeholder="تجربه خود از استفاده از این رسانه را بنویسید... (حداقل ۱۰ کاراکتر)"
            aria-label="متن نظر"
            rows={3}
          />
          {error && <div role="alert" className={form.error}>{error}</div>}
          <Button type="submit" intent="primary" disabled={submitting} className={styles.submit}>
            <Send size={14} /> {submitting ? "در حال ارسال..." : editing ? "ذخیرهٔ تغییرات" : "ثبت نظر"}
          </Button>
        </form>
      )}

      {success && !editing && (
        <div role="status" className={`${form.success} ${styles.notice}`}><Check size={15} /> نظر شما با موفقیت ثبت شد</div>
      )}

      {user === null && (
        <div className={styles.signIn}>
          برای ثبت نظر باید <Link href={`/login?next=${encodeURIComponent(pathname)}`}>وارد حساب کاربری</Link> شوید
        </div>
      )}

      {error && !formOpen && <div role="alert" className={`${form.error} ${styles.notice}`}>{error}</div>}

      {loading ? (
        <div className={styles.state}>در حال بارگذاری...</div>
      ) : loadError ? (
        <div role="alert" className={styles.state}>
          <div>نظرها بارگذاری نشد. {loadError}</div>
          <Button size="sm" onClick={() => { setLoading(true); fetchReviews(); }}>تلاش دوباره</Button>
        </div>
      ) : reviews.length === 0 ? (
        <div className={`${styles.state} ${styles.empty}`}>
          <Star size={28} />
          هنوز نظری ثبت نشده — اولین نفر باشید!
        </div>
      ) : (
        <ul className={styles.list}>
          {reviews.map(r => (
            <li key={r.id} className={styles.review}>
              <div className={styles.reviewHead}>
                <div className={styles.author}>
                  <span className={styles.avatar} aria-hidden>{r.user.name[0]}</span>
                  {r.user.name}
                </div>
                <div className={styles.summary}>
                  <StarRating value={r.rating} />
                  <span className={styles.date}>{date(r.createdAt)}</span>
                </div>
              </div>
              <p className={styles.body}>{r.comment}</p>
              {/* Editing and deleting belong to the author, deleting also to an
                  editor; replying is open to anyone signed in. Staff and
                  customer ids come from different tables and overlap, so a
                  staff member is never matched as an author. */}
              {user && (
                <div className={styles.actions}>
                  {r.userId === user.id && !user.isStaff && (
                    <>
                      <Button size="sm" onClick={startEdit} disabled={deletingId === r.id}><Pencil size={11} /> ویرایش</Button>
                      <Button size="sm" intent="danger" onClick={() => handleDelete(r.id)} disabled={deletingId === r.id}>
                        <Trash2 size={11} /> {deletingId === r.id ? "در حال حذف…" : "حذف"}
                      </Button>
                    </>
                  )}
                  {user.canModerate && (
                    <Button size="sm" intent="danger" onClick={() => handleDelete(r.id)} disabled={deletingId === r.id}>
                      <Trash2 size={11} /> {deletingId === r.id ? "در حال حذف…" : "حذف (مدیریت)"}
                    </Button>
                  )}
                  <Button size="sm" intent="quiet" onClick={() => openReply(r.id)}><CornerDownLeft size={11} /> پاسخ</Button>
                </div>
              )}

              {(r.replies?.length > 0 || replyTo === r.id) && (
                <div className={styles.thread}>
                  {r.replies?.map(rp => (
                    <div key={rp.id} className={`${styles.reply} ${rp.isStaff ? styles.staffReply : ""}`}>
                      <div className={styles.replyHead}>
                        <span>{rp.authorName}</span>
                        {rp.isStaff && <span className={styles.team}><ShieldCheck size={9} /> تیم رسامپ</span>}
                        <span className={styles.replyDate}>{date(rp.createdAt)}</span>
                        {user && (user.canModerate || (!user.isStaff && rp.userId !== null && rp.userId === user.id)) && (
                          <button type="button" className={styles.replyDelete} onClick={() => deleteReply(r.id, rp.id)} disabled={busyReplyId === rp.id}>
                            <Trash2 size={10} /> {busyReplyId === rp.id ? "…" : "حذف"}
                          </button>
                        )}
                      </div>
                      <p className={styles.replyBody}>{rp.body}</p>
                    </div>
                  ))}

                  {replyTo === r.id && (
                    <div className={styles.compose}>
                      <textarea
                        className={form.input}
                        value={replyBody} onChange={e => setReplyBody(e.target.value)}
                        rows={2} maxLength={600}
                        aria-label="متن پاسخ"
                        placeholder={user?.isStaff ? "پاسخ رسمی تیم رسامپ…" : "پاسخ شما…"}
                      />
                      <div className={styles.composeButtons}>
                        <Button size="sm" intent="primary" onClick={() => sendReply(r.id)} disabled={replyBusy}>{replyBusy ? "…" : "ارسال"}</Button>
                        <Button size="sm" intent="quiet" onClick={() => setReplyTo(null)}>انصراف</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
