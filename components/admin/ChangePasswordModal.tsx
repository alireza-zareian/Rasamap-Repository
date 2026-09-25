"use client";
import { useState } from "react";
import { X, KeyRound, AlertTriangle, Check } from "lucide-react";
import { fetchJson, errorMessage } from "@/lib/client/fetch-json";
import { useModalA11y } from "@/lib/client/use-modal-a11y";
import { C } from "./constants";

/**
 * A staff member changes their own password (PATCH /api/admin/auth/me).
 * Every other session of the account ends; this one is re-issued by the
 * response, so the panel keeps working without a fresh sign-in.
 */
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const boxRef = useModalA11y<HTMLDivElement>(onClose);
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const iS: React.CSSProperties = { width: "100%", background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: C.font, fontSize: "0.82rem", padding: "9px 12px", borderRadius: 8, outline: "none", boxSizing: "border-box", direction: "ltr", textAlign: "left" };
  const lS: React.CSSProperties = { fontSize: "0.72rem", color: C.muted, marginBottom: 5, display: "block" };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!form.current) { setError("رمز فعلی را وارد کنید"); return; }
    if (form.next.length < 8) { setError("رمز جدید باید حداقل ۸ نویسه باشد"); return; }
    if (form.next !== form.confirm) { setError("رمز جدید و تکرار آن یکسان نیستند"); return; }
    setError(""); setSaving(true);
    try {
      await fetchJson("/api/admin/auth/me", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }),
      });
      setDone(true);
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div ref={boxRef} role="dialog" aria-modal="true" aria-label="تغییر رمز عبور" tabIndex={-1} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 26, width: "min(420px, 94vw)", direction: "rtl", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.95rem", fontWeight: 700 }}><KeyRound size={16} /> تغییر رمز عبور</div>
          <button type="button" aria-label="بستن" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex" }}><X size={18} /></button>
        </div>
        {done ? (
          <>
            <div role="status" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 10, padding: "12px 14px", fontSize: "0.8rem", color: "#22c55e", display: "flex", alignItems: "center", gap: 6 }}>
              <Check size={15} /> رمز عوض شد. نشست‌های شما در دستگاه‌های دیگر بسته شد.
            </div>
            <button onClick={onClose} style={{ marginTop: 16, width: "100%", background: C.accent, border: "none", color: "#fff", fontFamily: C.font, fontSize: "0.85rem", fontWeight: 700, padding: 11, borderRadius: 9, cursor: "pointer" }}>بستن</button>
          </>
        ) : (
          <form onSubmit={submit}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label htmlFor="pw-current" style={lS}>رمز فعلی</label><input id="pw-current" style={iS} value={form.current} onChange={set("current")} type="password" autoComplete="current-password" /></div>
              <div><label htmlFor="pw-next" style={lS}>رمز جدید (حداقل ۸ نویسه)</label><input id="pw-next" style={iS} value={form.next} onChange={set("next")} type="password" autoComplete="new-password" /></div>
              <div><label htmlFor="pw-confirm" style={lS}>تکرار رمز جدید</label><input id="pw-confirm" style={iS} value={form.confirm} onChange={set("confirm")} type="password" autoComplete="new-password" /></div>
            </div>
            {error && <div role="alert" style={{ marginTop: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "8px 12px", fontSize: "0.78rem", color: "#ef4444", display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={13} /> {error}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button type="submit" disabled={saving} style={{ flex: 1, background: C.accent, border: "none", color: "#fff", fontFamily: C.font, fontSize: "0.85rem", fontWeight: 700, padding: 11, borderRadius: 9, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}>
                {saving ? "در حال ذخیره..." : "ذخیرهٔ رمز جدید"}
              </button>
              <button type="button" onClick={onClose} style={{ padding: "11px 20px", background: "none", border: `1px solid ${C.border}`, color: C.muted, fontFamily: C.font, borderRadius: 9, cursor: "pointer" }}>انصراف</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
