"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";

interface Props {
  hasPhone: boolean;
  agency?: string;
  slug: string;
}

export default function BillboardContact({ hasPhone, agency, slug }: Props) {
  const { user, loading } = useCurrentUser();
  const [phone, setPhone] = useState<string | null>(null);
  const next = `/billboard/${slug}`;
  const agencyLabel = agency && agency !== "اجاره‌دهنده مستقیم" ? agency : "آگهی‌دهنده";

  useEffect(() => {
    if (!user || !hasPhone) return;
    fetch(`/api/billboards/${slug}/contact`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPhone(d?.phone ?? null))
      .catch(() => setPhone(null));
  }, [user, hasPhone, slug]);

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
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>در حال دریافت شماره…</div>
        )
      ) : (
        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
          آژانس: <span style={{ color: "var(--text-main)" }}>{agency}</span>
        </div>
      )}
    </div>
  );
}
