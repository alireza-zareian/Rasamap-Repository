"use client";
import { useState, useEffect } from "react";
import { C } from "./constants";
import { Badge } from "./Badge";
import { ScrollText } from "lucide-react";

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

  useEffect(() => {
    fetch("/api/admin/audit")
      .then(r => r.json())
      .then(d => { setLogs(d.logs ?? []); setPersisted(d.persisted ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const sevC: Record<string, string> = { info: C.muted, warn: "#f59e0b", critical: "#ef4444" };
  const rows = view === "persisted" ? persisted : logs;

  const tab = (key: "persisted" | "live", label: string, count: number) => (
    <button
      onClick={() => setView(key)}
      style={{
        background: view === key ? C.accent : "transparent",
        color: view === key ? "#fff" : C.muted,
        border: `1px solid ${view === key ? C.accent : C.border}`,
        borderRadius: 8, padding: "6px 14px", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
      }}
    >
      {label} <span style={{ opacity: 0.7 }}>({count.toLocaleString("fa-IR")})</span>
    </button>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.9rem", fontWeight: 700 }}><ScrollText size={16} /> لاگ‌های امنیتی</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tab("persisted", "پایدار (دیتابیس)", persisted.length)}
          {tab("live", "زنده (حافظه)", logs.length)}
        </div>
      </div>

      <div style={{ fontSize: "0.72rem", color: C.muted, marginBottom: 14, lineHeight: 1.8 }}>
        {view === "persisted"
          ? "رکوردهای ماندگار در جدول audit_logs — بعد از ری‌استارت هم باقی می‌مانند. کارهای مدیر: ساخت/ویرایش/حذف رسانه و تغییر وضعیت رزرو."
          : "بافر حافظه (۵۰۰ مورد آخر) — شامل ورود/خروج و رویدادهای امنیتی؛ با ری‌استارت پاک می‌شود."}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: C.muted, padding: 40 }}>در حال بارگذاری...</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", color: C.muted, padding: 40 }}>هنوز رکوردی ثبت نشده</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map(row => (
            <div key={String(row.id)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", minWidth: 0, maxWidth: "100%" }}>
                <Badge text={row.severity.toUpperCase()} color={sevC[row.severity] ?? C.muted} bg={`${sevC[row.severity] ?? C.muted}18`} />
                <span style={{ fontSize: "0.8rem", fontWeight: 600, fontFamily: "monospace", overflowWrap: "anywhere" }}>{row.action}</span>
                {row.userEmail && <span style={{ fontSize: "0.75rem", color: C.muted, overflowWrap: "anywhere" }}>{row.userEmail}</span>}
                {row.ip && <span style={{ fontSize: "0.72rem", color: C.muted }}>IP: {row.ip}</span>}
                {view === "persisted" && row.details != null && (
                  <span style={{ fontSize: "0.7rem", color: C.muted, fontFamily: "monospace", overflowWrap: "anywhere", minWidth: 0 }}>
                    {typeof row.details === "string" ? row.details : JSON.stringify(row.details)}
                  </span>
                )}
              </div>
              <div style={{ fontSize: "0.7rem", color: C.muted, flexShrink: 0 }}>{new Date(row.timestamp).toLocaleString("fa-IR")}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
