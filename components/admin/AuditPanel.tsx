"use client";
import { useState, useEffect } from "react";
import { C } from "./constants";
import { Badge } from "./Badge";

export function AuditPanel() {
  const [logs, setLogs] = useState<{ id: string; timestamp: string; action: string; userEmail?: string; ip?: string; severity: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/audit")
      .then(r => r.json())
      .then(d => { setLogs(d.logs ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const sevC: Record<string, string> = { info: C.muted, warn: "#f59e0b", critical: "#ef4444" };

  return (
    <div>
      <div style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 20 }}>📋 لاگ‌های امنیتی</div>
      {loading ? (
        <div style={{ textAlign: "center", color: C.muted, padding: 40 }}>در حال بارگذاری...</div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: "center", color: C.muted, padding: 40 }}>هنوز لاگی ثبت نشده</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {logs.map(log => (
            <div key={log.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <Badge text={log.severity.toUpperCase()} color={sevC[log.severity] ?? C.muted} bg={`${sevC[log.severity] ?? C.muted}18`} />
                <span style={{ fontSize: "0.8rem", fontWeight: 600, fontFamily: "monospace" }}>{log.action}</span>
                {log.userEmail && <span style={{ fontSize: "0.75rem", color: C.muted }}>{log.userEmail}</span>}
                {log.ip && <span style={{ fontSize: "0.72rem", color: C.muted }}>IP: {log.ip}</span>}
              </div>
              <div style={{ fontSize: "0.7rem", color: C.muted, flexShrink: 0 }}>{new Date(log.timestamp).toLocaleString("fa-IR")}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
