"use client";
import { useState, useEffect, useCallback } from "react";
import { C } from "./constants";
import type { UserRole } from "@/lib/auth/session";

interface ReservationRow {
  id:        number;
  status:    string;
  startDate: string;
  endDate:   string;
  createdAt: string;
  billboard: { id: number; name: string; city: string; price: number };
  user:      { id: number; name: string; phone: string };
}

const STATUS_LABEL: Record<string, string> = {
  pending:   "در انتظار",
  confirmed: "تأیید شده",
  cancelled: "لغو شده",
};
const STATUS_COLOR: Record<string, [string, string]> = {
  pending:   ["#f59e0b", "rgba(245,158,11,0.12)"],
  confirmed: [C.green,   "rgba(34,197,94,0.12)"],
  cancelled: [C.red,     "rgba(239,68,68,0.12)"],
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric" });
}

interface Props { userRole: UserRole; }

export function ReservationsPanel({ userRole }: Props) {
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [pages, setPages]     = useState(1);
  const [page, setPage]       = useState(1);
  const [filter, setFilter]   = useState("");
  const [loading, setLoading] = useState(false);
  const [acting, setActing]   = useState<number | null>(null);
  const [error, setError]     = useState("");

  const canManage = ["super_admin", "admin"].includes(userRole);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ status: filter, page: page.toString(), limit: "20" });
      const res = await fetch(`/api/admin/reservations?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setReservations(data.reservations ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
    } catch { setError("خطا در بارگذاری رزروها"); }
    setLoading(false);
  }, [filter, page]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(id: number, status: "confirmed" | "cancelled") {
    setActing(id); setError("");
    try {
      const res = await fetch(`/api/admin/reservations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "خطا در تغییر وضعیت"); return; }
      setReservations(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch { setError("خطای شبکه"); }
    setActing(null);
  }

  const pill = (s: string) => {
    const [color, bg] = STATUS_COLOR[s] ?? [C.muted, "rgba(148,163,184,0.1)"];
    return (
      <span style={{ fontSize: "0.72rem", fontWeight: 700, padding: "3px 9px", borderRadius: 99, background: bg, color, border: `1px solid ${color}40` }}>
        {STATUS_LABEL[s] ?? s}
      </span>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: "1.05rem", fontWeight: 800 }}>مدیریت رزروها</div>
          <div style={{ fontSize: "0.75rem", color: C.muted, marginTop: 2 }}>تأیید یا رد رزروهای کاربران</div>
        </div>
        <select
          value={filter}
          onChange={e => { setFilter(e.target.value); setPage(1); }}
          style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: C.font, fontSize: "0.8rem", padding: "8px 12px", borderRadius: 8, outline: "none" }}>
          <option value="">همه ({total})</option>
          <option value="pending">در انتظار</option>
          <option value="confirmed">تأیید شده</option>
          <option value="cancelled">لغو شده</option>
        </select>
      </div>

      {error && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: "0.8rem", color: C.red, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: C.muted, fontSize: "0.85rem" }}>در حال بارگذاری...</div>
      ) : reservations.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: C.muted, fontSize: "0.85rem" }}>رزروی یافت نشد</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {reservations.map(r => (
            <div key={r.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 18px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    {pill(r.status)}
                    <span style={{ fontSize: "0.72rem", color: C.muted }}>#{r.id}</span>
                  </div>
                  <div style={{ fontSize: "0.88rem", fontWeight: 700, marginBottom: 4 }}>{r.billboard.name}</div>
                  <div style={{ fontSize: "0.78rem", color: C.muted, display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <span>📍 {r.billboard.city}</span>
                    <span>👤 {r.user.name} · {r.user.phone}</span>
                    <span>📅 {fmt(r.startDate)} — {fmt(r.endDate)}</span>
                    <span>💰 {r.billboard.price.toLocaleString("fa-IR")}M/ماه</span>
                  </div>
                </div>
                {canManage && r.status === "pending" && (
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => updateStatus(r.id, "confirmed")}
                      disabled={acting === r.id}
                      style={{ fontSize: "0.78rem", padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.green}40`, background: "rgba(34,197,94,0.08)", color: C.green, fontFamily: C.font, cursor: acting === r.id ? "not-allowed" : "pointer", fontWeight: 700 }}>
                      {acting === r.id ? "..." : "✓ تأیید"}
                    </button>
                    <button
                      onClick={() => updateStatus(r.id, "cancelled")}
                      disabled={acting === r.id}
                      style={{ fontSize: "0.78rem", padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.red}40`, background: "rgba(239,68,68,0.08)", color: C.red, fontFamily: C.font, cursor: acting === r.id ? "not-allowed" : "pointer", fontWeight: 700 }}>
                      {acting === r.id ? "..." : "✗ رد"}
                    </button>
                  </div>
                )}
                {r.status === "confirmed" && (
                  <span style={{ fontSize: "0.72rem", color: C.green, padding: "7px 10px" }}>تأیید شده ✓</span>
                )}
                {r.status === "cancelled" && (
                  <span style={{ fontSize: "0.72rem", color: C.red, padding: "7px 10px" }}>لغو شده</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 20 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "none", color: C.muted, fontFamily: C.font, cursor: page === 1 ? "not-allowed" : "pointer" }}>← قبلی</button>
          <span style={{ padding: "7px 14px", fontSize: "0.78rem", color: C.muted }}>{page} / {pages}</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "none", color: C.muted, fontFamily: C.font, cursor: page === pages ? "not-allowed" : "pointer" }}>بعدی →</button>
        </div>
      )}
    </div>
  );
}
