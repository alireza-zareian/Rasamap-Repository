"use client";
import { useState, useEffect, useCallback } from "react";
import { Star, MessageSquare, Send, Check } from "lucide-react";

interface Review {
  id: number;
  rating: number;
  comment: string;
  createdAt: string;
  user: { name: string };
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
  const [user, setUser] = useState<{ name: string } | null | undefined>(undefined);

  // Form state
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

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
      .then(d => setUser(d?.user ?? null))
      .catch(() => setUser(null));
  }, [fetchReviews]);

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
      setComment(""); setRating(0);
      fetchReviews();
    } catch { setError("خطای شبکه — دوباره تلاش کنید"); }
    finally { setSubmitting(false); }
  };

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
      {user && !success && (
        <form onSubmit={handleSubmit} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: 10 }}>ثبت نظر شما</div>
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
            <Send size={14} /> {submitting ? "در حال ارسال..." : "ثبت نظر"}
          </button>
        </form>
      )}

      {success && (
        <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 10, padding: "12px 16px", fontSize: "0.82rem", color: "var(--green)", marginBottom: 16, display: "flex", alignItems: "center", gap: 6 }}>
          <Check size={15} /> نظر شما با موفقیت ثبت شد
        </div>
      )}

      {user === null && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 16, textAlign: "center" }}>
          برای ثبت نظر باید <a href="/login" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>وارد حساب کاربری</a> شوید
        </div>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
