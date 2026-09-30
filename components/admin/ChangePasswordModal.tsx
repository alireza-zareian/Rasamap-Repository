"use client";
import { useState } from "react";
import { KeyRound, AlertTriangle, Check } from "lucide-react";
import { fetchJson, errorMessage } from "@/lib/client/fetch-json";
import { MIN_PASSWORD_LENGTH, PASSWORD_TOO_SHORT } from "@/lib/domain/password";
import { faNum } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import field from "@/components/ui/form.module.css";

/**
 * A staff member changes their own password (PATCH /api/admin/auth/me). Every
 * other session of the account ends; this one is kept, so the panel keeps working.
 */
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!form.current) { setError("رمز فعلی را وارد کنید"); return; }
    if (form.next.length < MIN_PASSWORD_LENGTH) { setError(PASSWORD_TOO_SHORT); return; }
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

  const input = `${field.input} ${field.ltr}`;

  return (
    <Dialog size="sm" icon={<KeyRound size={16} />} title="تغییر رمز عبور" onClose={onClose}>
      {done ? (
        <>
          <div role="status" className={field.success}><Check size={15} /> رمز عوض شد. نشست‌های شما در دستگاه‌های دیگر بسته شد.</div>
          <Button intent="primary" block onClick={onClose}>بستن</Button>
        </>
      ) : (
        <form className={field.stack} onSubmit={submit}>
          <div className={field.field}><label htmlFor="pw-current" className={field.label}>رمز فعلی</label><input id="pw-current" className={input} value={form.current} onChange={set("current")} type="password" autoComplete="current-password" /></div>
          <div className={field.field}><label htmlFor="pw-next" className={field.label}>رمز جدید (حداقل {faNum(MIN_PASSWORD_LENGTH)} نویسه)</label><input id="pw-next" className={input} value={form.next} onChange={set("next")} type="password" autoComplete="new-password" /></div>
          <div className={field.field}><label htmlFor="pw-confirm" className={field.label}>تکرار رمز جدید</label><input id="pw-confirm" className={input} value={form.confirm} onChange={set("confirm")} type="password" autoComplete="new-password" /></div>
          {error && <div role="alert" className={field.error}><AlertTriangle size={13} /> {error}</div>}
          <div className={field.row}>
            <Button type="submit" intent="primary" disabled={saving}>{saving ? "در حال ذخیره…" : "ذخیرهٔ رمز جدید"}</Button>
            <Button intent="quiet" onClick={onClose}>انصراف</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
