"use client";
import { useState, useEffect, useCallback } from "react";
import type { UserRole } from "@/lib/auth/session";
import { C, ROLE_LABEL, ROLE_COLOR } from "./constants";
import { Badge } from "./Badge";
import { Users, Plus, X, AlertTriangle } from "lucide-react";

interface SessionUser { id: string; name: string; role: UserRole; email: string; }

interface AdminRow {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

const ROLES: { value: UserRole; label: string }[] = [
  { value: "viewer", label: "بیننده" },
  { value: "editor", label: "ویرایشگر" },
  { value: "admin", label: "ادمین" },
  { value: "super_admin", label: "سوپر ادمین" },
];

const fmt = (d: string) => new Date(d).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric" });

export function UsersPanel({ currentUser }: { currentUser: SessionUser }) {
  const isSA = currentUser.role === "super_admin";

  const [rows, setRows] = useState<AdminRow[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(isSA);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "خطا در بارگذاری"); return; }
      setRows(data.admins ?? []);
      setCurrentId(data.currentId ?? null);
    } catch { setError("خطای شبکه"); }
    finally { setLoading(false); }
  }, []);

  // Data-fetch effect: load() flips loading/error state, which is expected here.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (isSA) load(); }, [isSA, load]);

  const patch = async (id: number, body: { role?: UserRole; active?: boolean }) => {
    setBusyId(id); setError("");
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "خطا در تغییر"); return; }
      setRows(prev => prev.map(r => r.id === id ? data.admin : r));
    } catch { setError("خطای شبکه"); }
    finally { setBusyId(null); }
  };

  if (!isSA) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.9rem", fontWeight: 700, marginBottom: 8 }}><Users size={16} /> مدیریت کاربران</div>
        <div style={{ padding: 14, background: "rgba(245,158,11,0.06)", borderRadius: 10, fontSize: "0.8rem", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.2)" }}>
          فقط سوپر ادمین به این بخش دسترسی دارد.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.9rem", fontWeight: 700 }}><Users size={16} /> مدیریت کاربران</div>
          <div style={{ fontSize: "0.75rem", color: C.muted, marginTop: 4, lineHeight: 1.8 }}>
            حساب‌های مدیریتی در جدول admins نگه‌داری می‌شوند. نقش‌ها از کم‌ترین به بیش‌ترین دسترسی:
            بیننده، ویرایشگر، ادمین، سوپر ادمین. هر ساخت یا تغییر نقش در لاگ امنیتی ثبت می‌شود.
          </div>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.78rem", padding: "7px 14px", borderRadius: 8, background: C.accent, border: "none", color: "#fff", fontFamily: C.font, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
          <Plus size={14} /> افزودن
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        {ROLES.slice().reverse().map(r => (
          <div key={r.value} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, textAlign: "center" }}>
            <Badge text={r.label} color={ROLE_COLOR[r.value]} bg={`${ROLE_COLOR[r.value]}20`} />
            <div style={{ fontSize: "0.7rem", color: C.muted, marginTop: 6 }}>{rows.filter(x => x.role === r.value).length} نفر</div>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "9px 13px", fontSize: "0.8rem", color: C.red, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: C.muted, fontSize: "0.85rem" }}>در حال بارگذاری...</div>
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead>
              <tr style={{ background: C.card }}>
                {["نام", "ایمیل", "نقش", "ساخته‌شده", "وضعیت"].map(h => (
                  <th key={h} style={{ padding: "11px 14px", textAlign: "right", fontSize: "0.75rem", color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(u => {
                const isSelf = u.id === currentId;
                return (
                  <tr key={u.id} style={{ borderBottom: `1px solid ${C.border}`, opacity: u.active ? 1 : 0.55 }}>
                    <td style={{ padding: "12px 14px", fontSize: "0.85rem", fontWeight: 600 }}>
                      {u.name}{isSelf && <span style={{ fontSize: "0.68rem", color: C.muted, marginRight: 6 }}>(شما)</span>}
                    </td>
                    <td style={{ padding: "12px 14px", fontSize: "0.8rem", color: C.muted, direction: "ltr", textAlign: "right" }}>{u.email}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <select
                        value={u.role}
                        disabled={isSelf || busyId === u.id}
                        onChange={e => patch(u.id, { role: e.target.value as UserRole })}
                        style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, fontFamily: C.font, fontSize: "0.78rem", padding: "5px 8px", borderRadius: 7, outline: "none", cursor: isSelf ? "not-allowed" : "pointer" }}
                      >
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "12px 14px", fontSize: "0.75rem", color: C.muted }}>{fmt(u.createdAt)}</td>
                    <td style={{ padding: "12px 14px" }}>
                      <button
                        onClick={() => patch(u.id, { active: !u.active })}
                        disabled={isSelf || busyId === u.id}
                        style={{ fontSize: "0.72rem", fontWeight: 700, padding: "5px 12px", borderRadius: 7, cursor: isSelf ? "not-allowed" : "pointer", fontFamily: C.font,
                          border: `1px solid ${u.active ? "rgba(34,197,94,0.4)" : `${C.border}`}`,
                          background: u.active ? "rgba(34,197,94,0.1)" : "none",
                          color: u.active ? C.green : C.muted }}
                      >
                        {u.active ? "فعال" : "غیرفعال"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddAdminModal
          onClose={() => setShowAdd(false)}
          onCreated={a => { setRows(prev => [...prev, a]); setShowAdd(false); }}
        />
      )}
    </div>
  );
}

function AddAdminModal({ onClose, onCreated }: { onClose: () => void; onCreated: (a: AdminRow) => void }) {
  const [form, setForm] = useState({ name: "", email: "", role: "viewer" as UserRole, password: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const iS: React.CSSProperties = { width: "100%", background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: C.font, fontSize: "0.82rem", padding: "9px 12px", borderRadius: 8, outline: "none", boxSizing: "border-box" };
  const lS: React.CSSProperties = { fontSize: "0.72rem", color: C.muted, marginBottom: 5, display: "block" };

  const submit = async () => {
    if (!form.name.trim()) { setError("نام الزامی است"); return; }
    if (!form.email.trim()) { setError("ایمیل الزامی است"); return; }
    if (form.password.length < 8) { setError("رمز عبور حداقل ۸ نویسه"); return; }
    setError(""); setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), email: form.email.trim(), role: form.role, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "خطا در ساخت کاربر"); setSaving(false); return; }
      onCreated(data.admin);
    } catch { setError("خطای شبکه"); setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 26, width: "min(440px, 94vw)", direction: "rtl", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.95rem", fontWeight: 700 }}><Plus size={16} /> کاربر مدیریتی جدید</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex" }}><X size={18} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><label style={lS}>نام</label><input style={iS} value={form.name} onChange={set("name")} /></div>
          <div><label style={lS}>ایمیل</label><input style={{ ...iS, direction: "ltr", textAlign: "left" }} value={form.email} onChange={set("email")} type="email" autoComplete="off" /></div>
          <div><label style={lS}>نقش</label>
            <select style={iS} value={form.role} onChange={set("role")}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div><label style={lS}>رمز عبور (حداقل ۸ نویسه)</label><input style={{ ...iS, direction: "ltr", textAlign: "left" }} value={form.password} onChange={set("password")} type="password" autoComplete="new-password" /></div>
        </div>
        {error && <div style={{ marginTop: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "8px 12px", fontSize: "0.78rem", color: "#ef4444", display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={13} /> {error}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={submit} disabled={saving} style={{ flex: 1, background: C.accent, border: "none", color: "#fff", fontFamily: C.font, fontSize: "0.85rem", fontWeight: 700, padding: 11, borderRadius: 9, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "در حال ساخت..." : "ساخت کاربر"}
          </button>
          <button onClick={onClose} style={{ padding: "11px 20px", background: "none", border: `1px solid ${C.border}`, color: C.muted, fontFamily: C.font, borderRadius: 9, cursor: "pointer" }}>انصراف</button>
        </div>
      </div>
    </div>
  );
}
