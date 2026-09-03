"use client";
import { useState } from "react";
import Link from "next/link";
import { Phone } from "lucide-react";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";

interface Props {
  hasPhone: boolean;
  agency?: string;
  slug: string;
}

/**
 * The owner's phone number, revealed on request.
 *
 * The number used to be fetched as soon as the page mounted. It is now behind
 * an explicit click, for two reasons: a render is not a statement of interest,
 * and POST /api/billboards/[slug]/contact records the reveal as a lead — so
 * what gets recorded has to be something the user actually chose to do.
 */
export default function BillboardContact({ hasPhone, agency, slug }: Props) {
  const { user, loading } = useCurrentUser();
  const [phone, setPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const next = `/billboard/${slug}`;
  const agencyLabel = agency && agency !== "اجاره‌دهنده مستقیم" ? agency : "آگهی‌دهنده";

  const reveal = async () => {
    if (busy || phone) return;                // one request in flight, once only
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/billboards/${slug}/contact`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "دریافت شماره ممکن نشد");
        return;
      }
      if (!data?.phone) {
        setError("شمارهٔ تماسی برای این رسانه ثبت نشده است");
        return;
      }
      setPhone(data.phone);
    } catch {
      setError("خطای شبکه — دوباره تلاش کنید");
    } finally {
      setBusy(false);
    }
  };

  if (!hasPhone && !agency) return null;

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
      {hasPhone ? (
        loading ? (
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>در حال بررسی…</div>
        ) : !user ? (
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 12px", textDecoration: "none", color: "var(--text-main)", fontWeight: 600, fontSize: "0.8rem" }}
          >
            برای دیدن اطلاعات تماس وارد شوید
          </Link>
        ) : phone ? (
          <>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: 6 }}>تماس با {agencyLabel}</div>
            <a
              href={`tel:${phone}`}
              style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(34,197,94,0.08)", border: "1.5px solid rgba(34,197,94,0.3)", borderRadius: 10, padding: "9px 12px", textDecoration: "none", color: "#22c55e", fontWeight: 700, fontSize: "0.95rem", direction: "ltr", letterSpacing: "0.03em" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.59A16 16 0 0 0 15.41 16l1.42-1.42a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
              {phone}
            </a>
          </>
        ) : (
          <>
            <button
              onClick={reveal}
              disabled={busy}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", background: busy ? "var(--bg-surface)" : "rgba(34,197,94,0.08)", border: `1.5px solid ${busy ? "var(--border)" : "rgba(34,197,94,0.3)"}`, borderRadius: 10, padding: "9px 12px", color: busy ? "var(--text-muted)" : "#22c55e", fontFamily: "inherit", fontWeight: 700, fontSize: "0.85rem", cursor: busy ? "default" : "pointer" }}
            >
              <Phone size={14} /> {busy ? "در حال دریافت…" : "نمایش شمارهٔ تماس"}
            </button>
            {error && (
              <div style={{ fontSize: "0.7rem", color: "#ef4444", marginTop: 7, lineHeight: 1.8 }}>{error}</div>
            )}
          </>
        )
      ) : (
        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
          آژانس: <span style={{ color: "var(--text-main)" }}>{agency}</span>
        </div>
      )}
    </div>
  );
}
