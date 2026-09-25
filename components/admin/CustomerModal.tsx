"use client";
import { useState, useEffect, useCallback } from "react";
import { fetchJson, errorMessage } from "@/lib/client/fetch-json";
import { useModalA11y } from "@/lib/client/use-modal-a11y";
import { copyText } from "@/lib/client/clipboard";
import { C, MODERATION_COLOR, MODERATION_LABEL } from "./constants";
import { Badge } from "./Badge";
import { User, X, AlertTriangle, KeyRound, Check, Copy } from "lucide-react";
import { faNum } from "@/lib/format";

interface UserListing {
  id: number;
  name: string;
  city: string;
  moderation: string;
  plan: string;
  featured: boolean;
  price: number;
  createdAt: string;
}
interface CustomerDetail {
  id: number;
  name: string;
  phone: string;
  createdAt: string;
  listings: UserListing[];
  _count: { listings: number; reviews: number };
}

const fmt = (d: string) => new Date(d).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric" });

export function CustomerModal({ userId, canManageAccess, onClose, onSaved }: {
  userId: number;
  /** Number and password: super admin only, enforced by the API as well. */
  canManageAccess: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const boxRef = useModalA11y<HTMLDivElement>(onClose);
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/admin/customers/${userId}`);
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "خطا در بارگذاری کاربر"); return; }
      setData(j.user);
      setName(j.user.name);
      setPhone(j.user.phone);
    } catch { setError("خطای شبکه"); }
    finally { setLoading(false); }
  }, [userId]);

  // Data-fetch effect: load() flips loading/error state, which is expected here.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const dirty = data ? (name.trim() !== data.name || phone.trim() !== data.phone) : false;

  const save = async () => {
    if (!dirty) return;
    setSaving(true); setError(""); setSavedOk(false);
    try {
      const j = await fetchJson<{ user: { name: string; phone: string } }>(`/api/admin/customers/${userId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      setData(d => d ? { ...d, name: j.user.name, phone: j.user.phone } : d);
      setSavedOk(true);
      onSaved?.();
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  };

  const resetPassword = async () => {
    setResetting(true); setError(""); setNewPassword(""); setCopied(false);
    try {
      const j = await fetchJson<{ password: string }>(`/api/admin/customers/${userId}/reset-password`, { method: "POST" });
      setNewPassword(j.password);
    } catch (err) { setError(errorMessage(err)); }
    finally { setResetting(false); }
  };

  const lS: React.CSSProperties = { fontSize: "0.72rem", color: C.muted, marginBottom: 5, display: "block" };
  const iS: React.CSSProperties = { width: "100%", background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: C.font, fontSize: "0.82rem", padding: "9px 12px", borderRadius: 8, outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div ref={boxRef} role="dialog" aria-modal="true" aria-label="ویرایش مشتری" tabIndex={-1} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, width: "min(520px, 94vw)", maxHeight: "90vh", overflowY: "auto", direction: "rtl", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.95rem", fontWeight: 700 }}><User size={16} /> مشخصات کاربر</div>
          <button type="button" aria-label="بستن پنجرهٔ مشتری" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex" }}><X size={18} /></button>
        </div>

        {error && (
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "9px 13px", fontSize: "0.8rem", color: C.red, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={13} /> {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: C.muted, fontSize: "0.85rem" }}>در حال بارگذاری...</div>
        ) : data ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div><label htmlFor="cust-name" style={lS}>نام</label><input id="cust-name" style={iS} value={name} onChange={e => { setName(e.target.value); setSavedOk(false); }} /></div>
              <div><label htmlFor="cust-phone" style={lS}>شماره موبایل</label><input id="cust-phone" style={{ ...iS, direction: "ltr", textAlign: "left", opacity: canManageAccess ? 1 : 0.6 }} value={phone} readOnly={!canManageAccess} title={canManageAccess ? undefined : "فقط سوپر ادمین می‌تواند شماره را تغییر دهد"} onChange={e => { setPhone(e.target.value); setSavedOk(false); }} placeholder="09xxxxxxxxx" /></div>
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: "0.75rem", color: C.muted, marginBottom: 16, flexWrap: "wrap" }}>
              <span>ثبت‌نام: {fmt(data.createdAt)}</span>
              <span>آگهی‌ها: {faNum(data._count.listings)}</span>
              <span>نظرها: {faNum(data._count.reviews)}</span>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
              <button onClick={save} disabled={!dirty || saving} style={{ flex: "1 1 140px", background: dirty ? C.accent : C.border, border: "none", color: "#fff", fontFamily: C.font, fontSize: "0.82rem", fontWeight: 700, padding: 10, borderRadius: 9, cursor: dirty && !saving ? "pointer" : "default", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {savedOk && !dirty ? <><Check size={14} /> ذخیره شد</> : saving ? "در حال ذخیره..." : "ذخیره تغییرات"}
              </button>
              {canManageAccess && (
                <button onClick={resetPassword} disabled={resetting} style={{ flex: "1 1 140px", background: "none", border: `1px solid ${C.border}`, color: C.text, fontFamily: C.font, fontSize: "0.82rem", fontWeight: 700, padding: 10, borderRadius: 9, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <KeyRound size={14} /> {resetting ? "..." : "بازنشانی رمز"}
                </button>
              )}
            </div>

            {newPassword && (
              <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 10, padding: "12px 14px", marginBottom: 18, fontSize: "0.78rem" }}>
                <div style={{ color: C.muted, marginBottom: 6 }}>رمز جدید ساخته شد. همین حالا به کاربر بدهید — دیگر نمایش داده نمی‌شود.</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <code style={{ flex: 1, direction: "ltr", textAlign: "left", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 10px", fontSize: "0.9rem", letterSpacing: 1 }}>{newPassword}</code>
                  {/* The generated password is shown once, so a copy button that lies is
                      worse than none: navigator.clipboard is undefined outside a
                      secure context (an admin opening the panel over http on the
                      local network), and the old code claimed "copied" regardless.
                      copyText() falls back to execCommand and reports the truth. */}
                  <button onClick={async () => setCopied(await copyText(newPassword))}
                    title={copied ? "کپی شد" : "کپی رمز — اگر مرورگر اجازه ندهد، رمز را دستی از کادر کناری بردارید"} style={{ background: "none", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "6px 8px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
              </div>
            )}

            <div style={{ fontSize: "0.8rem", fontWeight: 700, marginBottom: 8 }}>آگهی‌های این کاربر</div>
            {data.listings.length === 0 ? (
              <div style={{ fontSize: "0.78rem", color: C.muted, padding: "10px 0" }}>هیچ آگهی ثبت نکرده است.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.listings.map(l => {
                  const label = MODERATION_LABEL[l.moderation] ?? l.moderation;
                  const [color] = MODERATION_COLOR[l.moderation] ?? [C.muted];
                  return (
                    <div key={l.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>{l.name}</div>
                        <div style={{ fontSize: "0.7rem", color: C.muted }}>
                          {l.city} · {faNum(l.price)}M تومان/ماه · {fmt(l.createdAt)}
                          {l.featured ? " · ویژه" : ""}
                        </div>
                      </div>
                      <Badge text={label} color={color} bg={`${color}1e`} />
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
