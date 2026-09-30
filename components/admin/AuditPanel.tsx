"use client";
import { useState, useEffect } from "react";
import { fetchJson, errorMessage } from "@/lib/client/fetch-json";
import { auditGloss } from "./constants";
import { Badge } from "./Badge";
import { ScrollText } from "lucide-react";
import { faNum } from "@/lib/format";
import form from "@/components/ui/form.module.css";
import styles from "./admin.module.css";
import own from "./AuditPanel.module.css";

const SEVERITY: Record<string, { label: string; tone: string }> = {
  info:     { label: "اطلاع",  tone: "var(--text-muted)" },
  warn:     { label: "هشدار",  tone: "#f59e0b" },
  critical: { label: "بحرانی", tone: "var(--red)" },
};

interface Row {
  id: string | number;
  timestamp: string;
  action: string;
  userEmail?: string | null;
  ip?: string | null;
  severity: string;
  details?: unknown;
}

export function AuditPanel() {
  const [logs, setLogs] = useState<Row[]>([]);
  const [persisted, setPersisted] = useState<Row[]>([]);
  const [view, setView] = useState<"persisted" | "live">("persisted");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // A failed read is shown as one, never as "no records yet".
  useEffect(() => {
    fetchJson<{ logs: Row[]; persisted: Row[] }>("/api/admin/audit")
      .then(d => { setLogs(d.logs); setPersisted(d.persisted); })
      .catch(err => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const rows = view === "persisted" ? persisted : logs;

  const tab = (key: "persisted" | "live", label: string, count: number) => (
    <button type="button" role="tab" aria-selected={view === key} className={own.view} onClick={() => setView(key)}>
      {label} <span>({faNum(count)})</span>
    </button>
  );

  return (
    <div>
      <div className={styles.head}>
        <h1 className={styles.title}><ScrollText size={16} /> لاگ‌های امنیتی</h1>
        <div className={own.views} role="tablist" aria-label="منبع لاگ">
          {tab("persisted", "پایدار (دیتابیس)", persisted.length)}
          {tab("live", "زنده (حافظه)", logs.length)}
        </div>
      </div>

      <p className={own.lede}>
        {view === "persisted"
          ? "رکوردهای ماندگار در جدول audit_logs — بعد از ری‌استارت هم باقی می‌مانند. کارهای مدیر: ساخت/ویرایش/حذف رسانه، تأیید یا رد آگهی کاربران، و مدیریت حساب‌ها."
          : "بافر حافظه (۵۰۰ مورد آخر) — شامل ورود/خروج و رویدادهای امنیتی؛ با ری‌استارت پاک می‌شود."}
      </p>

      {loading ? (
        <div className={styles.state}>در حال بارگذاری…</div>
      ) : error ? (
        <div role="alert" className={form.error}>لاگ خوانده نشد. {error}</div>
      ) : rows.length === 0 ? (
        <div className={styles.state}>هنوز رکوردی ثبت نشده</div>
      ) : (
        <ul className={own.rows}>
          {rows.map(row => {
            const gloss = auditGloss(row.action);
            const severity = SEVERITY[row.severity] ?? { label: row.severity, tone: "var(--text-muted)" };
            return (
              <li key={String(row.id)} className={own.row}>
                <div className={own.body}>
                  <div className={own.line}>
                    <Badge text={severity.label} tone={severity.tone} />
                    <strong>{gloss?.title ?? row.action}</strong>
                    <span className={own.code}>{row.action}</span>
                  </div>
                  {gloss && <p className={own.desc}>{gloss.desc}</p>}
                  <div className={own.line}>
                    {row.userEmail && <span className={own.wrap}>{row.userEmail}</span>}
                    {row.ip && <span>IP: <span className={own.code}>{row.ip}</span></span>}
                    {view === "persisted" && row.details != null && (
                      <span className={own.code}>{typeof row.details === "string" ? row.details : JSON.stringify(row.details)}</span>
                    )}
                  </div>
                </div>
                <time className={own.time} dateTime={row.timestamp}>{new Date(row.timestamp).toLocaleString("fa-IR")}</time>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
