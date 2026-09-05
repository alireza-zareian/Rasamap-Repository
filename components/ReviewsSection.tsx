"use client";
import { useState, useEffect, useCallback } from "react";
import { Star, MessageSquare, Send, Check, Pencil, Trash2, X, CornerDownLeft, ShieldCheck } from "lucide-react";

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
    <div style={{ display: "flex", gap: 4 }}>
      {[1,2,3,4,5].map(n => {
        const active = n <= (hover || value);
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange?.(n)}
            onMouseEnter={() => onChange && setHover(n)}
            onMouseLeave={() => onChange && setHover(0)}
            style={{
              background: "none", border: "none", cursor: onChange ? "pointer" : "default", padding: 0,
              color: active ? "#f59e0b" : "var(--border)",
              lineHeight: 1, display: "flex",
            }}
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
  const [loading, setLoading] = useState(true);
  // undefined = still asking, null = signed out.
  const [user, setUser] = useState<{ id: number; name: string; isStaff: boolean } | null | undefined>(undefined);

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

  const fetchReviews = useCallback(() => {
    fetch(`/api/reviews?billboardId=${billboardId}`)
      .then(r => r.json())
      .then(d => { setReviews(d.reviews ?? []); setAvg(d.avg); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [billboardId]);

  useEffect(() => {
    fetchReviews();
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(d => setUser(d?.user ? { id: Number(d.user.id), name: d.user.name, isStaff: !!d.user.isStaff } : null))
      .catch(() => setUser(null));
  }, [fetchReviews]);

  // One review per account per media (a unique index enforces it), so there is
  // at most one of these — it is what the edit and delete buttons act on.
  const mine = user ? reviews.find(r => r.userId === user.id) ?? null : null;

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
      const res = await fetch(`/api/reviews/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "حذف نظر ممکن نشد");
        return;
      }
      cancelEdit();
      setSuccess(false);
      fetchReviews();
    } catch {
      setError("خطای شبکه — دوباره تلاش کنید");
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
      const res = await fetch(`/api/reviews/${reviewId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setError(data?.error ?? "ثبت پاسخ ممکن نشد"); return; }
      setReplyTo(null); setReplyBody("");
      fetchReviews();
    } catch { setError("خطای شبکه — دوباره تلاش کنید"); }
    finally { setReplyBusy(false); }
  };

  const deleteReply = async (reviewId: number, replyId: number) => {
    if (busyReplyId) return;
    setBusyReplyId(replyId); setError("");
    try {
      const res = await fetch(`/api/reviews/${reviewId}/replies/${replyId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "حذف پاسخ ممکن نشد");
        return;
      }
      fetchReviews();
    } catch { setError("خطای شبکه — دوباره تلاش کنید"); }
    finally { setBusyReplyId(null); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) { setError("لطفاً امتیاز را انتخاب کنید"); return; }
    if (comment.length < 10) { setError("نظر باید حداقل ۱۰ کاراکتر باشد"); return; }
    setError(""); setSubmitting(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billboardId, rating, comment }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "خطا در ثبت نظر"); return; }
      setSuccess(true);
      setEditing(false);
      setComment(""); setRating(0);
      fetchReviews();
    } catch { setError("خطای شبکه — دوباره تلاش کنید"); }
    finally { setSubmitting(false); }
  };

  // The form is on screen either to write a first review or to edit the one
  // this account already left. Named once so the error banner below can ask the
  // opposite question without repeating the expression.
  const formOpen = !!user && (editing || (!mine && !success));

  const actionBtn = (color: string, border: string): React.CSSProperties => ({
    background: "none", border: `1px solid ${border}`, color,
    fontFamily: "inherit", fontSize: "0.72rem", fontWeight: 600,
    padding: "5px 12px", borderRadius: 7, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 5,
  });

  const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, marginTop: 16 };

  return (
    <div style={card}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", fontWeight: 700 }}>
          <MessageSquare size={16} color="var(--accent)" />
          نظرات و امتیاز
        </div>
        {avg !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <StarRating value={Math.round(avg)} />
            <span style={{ fontSize: "1rem", fontWeight: 800, color: "#f59e0b" }}>{avg}</span>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>({reviews.length} نظر)</span>
          </div>
        )}
      </div>

      {/* Review form */}
      {formOpen && (
        <form onSubmit={handleSubmit} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>{editing ? "ویرایش نظر شما" : "ثبت نظر شما"}</span>
            {editing && (
              <button type="button" onClick={cancelEdit} style={{ background: "none", border: "none", color: "var(--text-muted)", fontFamily: "inherit", fontSize: "0.72rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, padding: 0 }}>
                <X size={12} /> انصراف
              </button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>امتیاز:</span>
            <StarRating value={rating} onChange={setRating} />
          </div>
          <textarea
            value={comment} onChange={e => setComment(e.target.value)}
            placeholder="تجربه خود از استفاده از این رسانه را بنویسید... (حداقل ۱۰ کاراکتر)"
            rows={3}
            style={{ width: "100%", background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.83rem", padding: "10px 12px", borderRadius: 8, outline: "none", resize: "vertical", marginBottom: 10 }}
          />
          {error && <div style={{ fontSize: "0.78rem", color: "#ef4444", marginBottom: 8 }}>{error}</div>}
          <button type="submit" disabled={submitting} style={{ background: submitting ? "var(--border)" : "var(--accent)", border: "none", color: "#fff", fontFamily: "inherit", fontSize: "0.82rem", fontWeight: 700, padding: "9px 20px", borderRadius: 8, cursor: submitting ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Send size={14} /> {submitting ? "در حال ارسال..." : editing ? "ذخیرهٔ تغییرات" : "ثبت نظر"}
          </button>
        </form>
      )}

      {success && !editing && (
        <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 10, padding: "12px 16px", fontSize: "0.82rem", color: "var(--green)", marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
          <Check size={15} /> نظر شما با موفقیت ثبت شد
        </div>
      )}

      {user === null && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 16, textAlign: "center" }}>
          برای ثبت نظر باید <a href="/login" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>وارد حساب کاربری</a> شوید
        </div>
      )}

      {error && !formOpen && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "9px 14px", fontSize: "0.78rem", color: "#ef4444", marginBottom: 12 }}>{error}</div>
      )}

      {/* Reviews list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-muted)", fontSize: "0.82rem" }}>در حال بارگذاری...</div>
      ) : reviews.length === 0 ? (
        <div style={{ textAlign: "center", padding: "28px 0", color: "var(--text-muted)", fontSize: "0.82rem" }}>
          <Star size={28} style={{ opacity: 0.25, display: "block", margin: "0 auto 10px" }} />
          هنوز نظری ثبت نشده — اولین نفر باشید!
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {reviews.map(r => (
            <div key={r.id} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 }}>
                    {r.user.name[0]}
                  </div>
                  <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{r.user.name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <StarRating value={r.rating} />
                  <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                    {new Date(r.createdAt).toLocaleDateString("fa-IR")}
                  </span>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.7 }}>{r.comment}</p>
              {/* Actions: editing and deleting belong to the author; replying
                  is open to anyone signed in. */}
              {user && (
                <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 9, borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
                  {r.userId === user.id && (
                    <>
                      <button onClick={startEdit} disabled={deletingId === r.id} style={actionBtn("var(--accent)", "var(--border)")}>
                        <Pencil size={11} /> ویرایش
                      </button>
                      <button onClick={() => handleDelete(r.id)} disabled={deletingId === r.id} style={actionBtn("#ef4444", "rgba(239,68,68,0.35)")}>
                        <Trash2 size={11} /> {deletingId === r.id ? "در حال حذف…" : "حذف"}
                      </button>
                    </>
                  )}
                  <button onClick={() => openReply(r.id)} style={actionBtn("var(--text-muted)", "var(--border)")}>
                    <CornerDownLeft size={11} /> پاسخ
                  </button>
                </div>
              )}

              {/* The thread */}
              {(r.replies?.length > 0 || replyTo === r.id) && (
                <div style={{ marginTop: 10, paddingRight: 14, borderRight: "2px solid var(--border)", display: "flex", flexDirection: "column", gap: 9 }}>
                  {r.replies?.map(rp => (
                    <div key={rp.id} style={{ background: rp.isStaff ? "rgba(59,123,245,0.06)" : "var(--bg-card)", border: `1px solid ${rp.isStaff ? "rgba(59,123,245,0.25)" : "var(--border)"}`, borderRadius: 9, padding: "9px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.76rem", fontWeight: 700 }}>{rp.authorName}</span>
                        {rp.isStaff && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "0.62rem", fontWeight: 700, color: "var(--accent)", background: "rgba(59,123,245,0.12)", border: "1px solid rgba(59,123,245,0.3)", borderRadius: 20, padding: "1px 7px" }}>
                            <ShieldCheck size={9} /> تیم رسامپ
                          </span>
                        )}
                        <span style={{ fontSize: "0.64rem", color: "var(--text-muted)", marginRight: "auto" }}>
                          {new Date(rp.createdAt).toLocaleDateString("fa-IR")}
                        </span>
                        {user && (user.isStaff || (rp.userId !== null && rp.userId === user.id)) && (
                          <button onClick={() => deleteReply(r.id, rp.id)} disabled={busyReplyId === rp.id}
                            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", fontSize: "0.64rem", gap: 3 }}>
                            <Trash2 size={10} /> {busyReplyId === rp.id ? "…" : "حذف"}
                          </button>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: "0.77rem", color: "var(--text-muted)", lineHeight: 1.75 }}>{rp.body}</p>
                    </div>
                  ))}

                  {replyTo === r.id && (
                    <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                      <textarea
                        value={replyBody} onChange={e => setReplyBody(e.target.value)}
                        rows={2} maxLength={600}
                        placeholder={user?.isStaff ? "پاسخ رسمی تیم رسامپ…" : "پاسخ شما…"}
                        style={{ flex: 1, background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.78rem", padding: "8px 10px", borderRadius: 8, outline: "none", resize: "vertical" }}
                      />
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        <button onClick={() => sendReply(r.id)} disabled={replyBusy}
                          style={{ background: replyBusy ? "var(--border)" : "var(--accent)", border: "none", color: "#fff", fontFamily: "inherit", fontSize: "0.72rem", fontWeight: 700, padding: "7px 13px", borderRadius: 7, cursor: replyBusy ? "default" : "pointer", whiteSpace: "nowrap" }}>
                          {replyBusy ? "…" : "ارسال"}
                        </button>
                        <button onClick={() => setReplyTo(null)}
                          style={{ background: "none", border: `1px solid var(--border)`, color: "var(--text-muted)", fontFamily: "inherit", fontSize: "0.72rem", padding: "6px 13px", borderRadius: 7, cursor: "pointer" }}>
                          انصراف
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
