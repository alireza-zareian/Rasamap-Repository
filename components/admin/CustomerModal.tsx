"use client";
import { useState, useEffect, useCallback } from "react";
import { fetchJson, errorMessage } from "@/lib/client/fetch-json";
import { copyText } from "@/lib/client/clipboard";
import { MODERATION_LABEL, moderationTone } from "./constants";
import { Badge } from "./Badge";
import { User, AlertTriangle, KeyRound, Check, Copy } from "lucide-react";
import { faNum, faMillions } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import form from "@/components/ui/form.module.css";
import styles from "./admin.module.css";
import own from "./CustomerModal.module.css";

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
      const j = await fetchJson<{ user: CustomerDetail }>(`/api/admin/customers/${userId}`);
      setData(j.user);
      setName(j.user.name);
      setPhone(j.user.phone);
    } catch (err) { setError(errorMessage(err)); }
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

  return (
    <Dialog size="md" icon={<User size={16} />} title="مشخصات کاربر" onClose={onClose}>
      {error && <div role="alert" className={form.error}><AlertTriangle size={13} /> {error}</div>}

      {loading ? (
        <div className={styles.state}>در حال بارگذاری…</div>
      ) : data ? (
        <>
          <div className={own.fields}>
            <div className={form.field}>
              <label htmlFor="cust-name" className={form.label}>نام</label>
              <input id="cust-name" className={form.input} value={name} onChange={e => { setName(e.target.value); setSavedOk(false); }} />
            </div>
            <div className={form.field}>
              <label htmlFor="cust-phone" className={form.label}>شماره موبایل</label>
              <input id="cust-phone" className={`${form.input} ${form.ltr}`} value={phone} readOnly={!canManageAccess}
                title={canManageAccess ? undefined : "فقط سوپر ادمین می‌تواند شماره را تغییر دهد"}
                onChange={e => { setPhone(e.target.value); setSavedOk(false); }} placeholder="09xxxxxxxxx" />
            </div>
          </div>
          <div className={own.facts}>
            <span>ثبت‌نام: {fmt(data.createdAt)}</span>
            <span>آگهی‌ها: {faNum(data._count.listings)}</span>
            <span>نظرها: {faNum(data._count.reviews)}</span>
          </div>

          <div className={own.buttons}>
            <Button intent="primary" onClick={save} disabled={!dirty || saving}>
              {savedOk && !dirty ? <><Check size={14} /> ذخیره شد</> : saving ? "در حال ذخیره…" : "ذخیره تغییرات"}
            </Button>
            {canManageAccess && (
              <Button onClick={resetPassword} disabled={resetting}><KeyRound size={14} /> {resetting ? "…" : "بازنشانی رمز"}</Button>
            )}
          </div>

          {newPassword && (
            <div className={own.secret} role="status">
              <p>رمز جدید ساخته شد. همین حالا به کاربر بدهید — دیگر نمایش داده نمی‌شود.</p>
              <div className={own.secretRow}>
                <code>{newPassword}</code>
                {/* Shown once, so copying must not fail silently over http:
                    copyText() falls back and says whether it worked. */}
                <Button size="sm" intent="quiet" onClick={async () => setCopied(await copyText(newPassword))}
                  aria-label="کپی رمز" title={copied ? "کپی شد" : "کپی رمز — اگر مرورگر اجازه ندهد، رمز را دستی از کادر کناری بردارید"}>
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                </Button>
              </div>
            </div>
          )}

          <h3 className={own.listTitle}>آگهی‌های این کاربر</h3>
          {data.listings.length === 0 ? (
            <p className={own.empty}>هیچ آگهی ثبت نکرده است.</p>
          ) : (
            <ul className={own.list}>
              {data.listings.map(l => (
                <li key={l.id} className={own.listing}>
                  <div>
                    <strong>{l.name}</strong>
                    <span>{l.city} · {faMillions(l.price)} تومان/ماه · {fmt(l.createdAt)}{l.featured ? " · ویژه" : ""}</span>
                  </div>
                  <Badge text={MODERATION_LABEL[l.moderation] ?? l.moderation} tone={moderationTone(l.moderation)} />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </Dialog>
  );
}
