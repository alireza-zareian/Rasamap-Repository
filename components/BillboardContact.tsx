"use client";
import { useState } from "react";
import { fetchJson, errorMessage } from "@/lib/client/fetch-json";
import Link from "next/link";
import { Phone } from "lucide-react";
import { useCurrentUser } from "@/lib/client/use-current-user";
import styles from "./detail.module.css";

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
      const data = await fetchJson<{ phone?: string }>(`/api/billboards/${slug}/contact`, { method: "POST" });
      if (!data?.phone) {
        setError("شمارهٔ تماسی برای این رسانه ثبت نشده است");
        return;
      }
      setPhone(data.phone);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!hasPhone && !agency) return null;

  return (
    <div className={styles.contact}>
      {hasPhone ? (
        loading ? (
          <div className={styles.muted}>در حال بررسی…</div>
        ) : !user ? (
          <Link href={`/login?next=${encodeURIComponent(next)}`} className={styles.signIn}>
            برای دیدن اطلاعات تماس وارد شوید
          </Link>
        ) : phone ? (
          <>
            <div className={styles.contactLabel}>تماس با {agencyLabel}</div>
            <a href={`tel:${phone}`} className={styles.phone}><Phone size={15} /> {phone}</a>
          </>
        ) : (
          <>
            <button type="button" data-testid="reveal-phone" className={styles.reveal} onClick={reveal} disabled={busy}>
              <Phone size={14} /> {busy ? "در حال دریافت…" : "نمایش شمارهٔ تماس"}
            </button>
            {error && <div role="alert" className={styles.error}>{error}</div>}
          </>
        )
      ) : (
        <div className={styles.muted}>آژانس: <b>{agency}</b></div>
      )}
    </div>
  );
}
