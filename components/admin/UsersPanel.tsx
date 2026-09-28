"use client";
import { useState, useEffect, useCallback } from "react";
import { fetchJson, errorMessage } from "@/lib/client/fetch-json";
import type { StaffRole } from "@/lib/domain/roles";
import { ROLE_COLOR } from "./constants";
import { Badge } from "./Badge";
import { Users, ShieldCheck, Plus, AlertTriangle, Search } from "lucide-react";
import { CustomerModal } from "./CustomerModal";
import { faNum } from "@/lib/format";
import { MIN_PASSWORD_LENGTH, PASSWORD_TOO_SHORT } from "@/lib/domain/password";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import form from "@/components/ui/form.module.css";
import styles from "./admin.module.css";
import own from "./UsersPanel.module.css";

interface SessionUser { id: string; name: string; role: StaffRole; email: string; }

interface AdminRow {
  id: number;
  email: string;
  name: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
}

interface CustomerRow {
  id: number;
  name: string;
  phone: string;
  createdAt: string;
  listingCount: number;
  reviewCount: number;
}

const ROLES: { value: StaffRole; label: string }[] = [
  { value: "viewer", label: "بیننده" },
  { value: "editor", label: "ویرایشگر" },
  { value: "admin", label: "ادمین" },
  { value: "super_admin", label: "سوپر ادمین" },
];

const fmt = (d: string) => new Date(d).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric" });

export function UsersPanel({ currentUser }: { currentUser: SessionUser }) {
  const isSA = currentUser.role === "super_admin";
  const isAdminPlus = currentUser.role === "admin" || isSA;

  if (!isAdminPlus) {
    return (
      <div>
        <h1 className={styles.title}><Users size={16} /> کاربران</h1>
        <p className={own.notice}>این بخش برای نقش «ادمین» و بالاتر در دسترس است.</p>
      </div>
    );
  }

  return (
    <div className={own.sections}>
      {isSA && <AdminAccounts />}
      <CustomersSection canManageAccess={isSA} />
    </div>
  );
}

// ── Staff accounts (super_admin only) ──────────────────────────────
// The API returns `currentId`, which locks the caller's own row.
function AdminAccounts() {
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await fetchJson<{ admins: AdminRow[]; currentId: number }>("/api/admin/users");
      setRows(data.admins);
      setCurrentId(data.currentId);
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, []);

  // Data-fetch effect: load() flips loading/error state, which is expected here.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const patch = async (id: number, body: { role?: StaffRole; active?: boolean }) => {
    setBusyId(id); setError("");
    try {
      const data = await fetchJson<{ admin: AdminRow }>(`/api/admin/users/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      setRows(prev => prev.map(r => r.id === id ? data.admin : r));
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusyId(null); }
  };

  return (
    <section>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}><ShieldCheck size={16} /> حساب‌های مدیریت (ادمین‌ها)</h2>
          <p className={own.lede}>
            حساب‌های مدیریتی در جدول admins نگه‌داری می‌شوند. نقش‌ها از کم‌ترین به بیش‌ترین دسترسی:
            بیننده، ویرایشگر، ادمین، سوپر ادمین. هر ساخت یا تغییر نقش در لاگ امنیتی ثبت می‌شود.
          </p>
        </div>
        <Button size="sm" intent="primary" onClick={() => setShowAdd(true)}><Plus size={14} /> افزودن</Button>
      </div>

      <div className={own.roles}>
        {ROLES.slice().reverse().map(r => (
          <div key={r.value} className={own.role}>
            <Badge text={r.label} tone={ROLE_COLOR[r.value]} />
            <div>{faNum(rows.filter(x => x.role === r.value).length)} نفر</div>
          </div>
        ))}
      </div>

      {error && <div role="alert" className={`${form.error} ${styles.banner}`}><AlertTriangle size={13} /> {error}</div>}

      {loading ? (
        <div className={styles.state}>در حال بارگذاری...</div>
      ) : (
        <div className={`${styles.tableCard} ${styles.scroll}`}>
          <table className={`${styles.table} ${own.wide}`}>
            <thead>
              <tr>{["نام", "ایمیل", "نقش", "ساخته‌شده", "وضعیت"].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(u => {
                const isSelf = u.id === currentId;
                return (
                  <tr key={u.id} className={u.active ? undefined : own.inactive}>
                    <td className={own.strong}>{u.name}{isSelf && <span className={own.you}>(شما)</span>}</td>
                    <td className={`${styles.muted} ${own.ltr}`}>{u.email}</td>
                    <td>
                      <select className={styles.control} aria-label={`نقش ${u.name}`} value={u.role}
                        disabled={isSelf || busyId === u.id} onChange={e => patch(u.id, { role: e.target.value as StaffRole })}>
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </td>
                    <td className={styles.muted}>{fmt(u.createdAt)}</td>
                    <td>
                      <Button size="sm" intent={u.active ? "success" : "quiet"} onClick={() => patch(u.id, { active: !u.active })}
                        disabled={isSelf || busyId === u.id} aria-pressed={u.active}>
                        {u.active ? "فعال" : "غیرفعال"}
                      </Button>
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
    </section>
  );
}

// ── Registered end-users directory (admin+) ───────────────────────

const CUSTOMER_SORTS: { value: string; label: string }[] = [
  { value: "created_desc", label: "جدیدترین" },
  { value: "created_asc", label: "قدیمی‌ترین" },
  { value: "name_asc", label: "نام (الفبا)" },
];

/**
 * `canManageAccess` — super admin only: resetting a customer's password and
 * moving their number both hand over the account (see updateCustomer).
 */
function CustomersSection({ canManageAccess }: { canManageAccess: boolean }) {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("created_desc");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20", sort });
      if (query) params.set("q", query);
      const data = await fetchJson<{ users: CustomerRow[]; total: number; pages: number }>(`/api/admin/customers?${params}`);
      setRows(data.users);
      setTotal(data.total);
      setPages(data.pages);
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, [page, sort, query]);

  // Data-fetch effect: load() flips loading/error state, which is expected here.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const runSearch = () => { setQuery(q.trim()); setPage(1); };

  return (
    <section>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}><Users size={16} /> کاربران ثبت‌نام‌شده</h2>
          <p className={own.lede}>همهٔ حساب‌های کاربری سایت (جدول users) — چه آگهی ثبت کرده باشند چه نه. {faNum(total)} نفر.</p>
        </div>
      </div>

      <form className={styles.toolbar} onSubmit={e => { e.preventDefault(); runSearch(); }}>
        <div className={own.searchRow}>
          <input className={styles.control} value={q} onChange={e => setQ(e.target.value)} aria-label="جستجوی کاربر" placeholder="جستجوی نام یا شماره..." />
          <Button type="submit" size="sm"><Search size={13} /> جستجو</Button>
        </div>
        <select className={styles.control} aria-label="مرتب‌سازی" value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>
          {CUSTOMER_SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </form>

      {error && <div role="alert" className={`${form.error} ${styles.banner}`}><AlertTriangle size={13} /> {error}</div>}

      {loading ? (
        <div className={styles.state}>در حال بارگذاری...</div>
      ) : rows.length === 0 ? (
        <div className={styles.state}>کاربری یافت نشد</div>
      ) : (
        <div className={`${styles.tableCard} ${styles.scroll}`}>
          <table className={styles.table}>
            <thead>
              <tr>{["نام", "شماره", "ثبت‌نام", "آگهی‌ها", "نظرها"].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(u => (
                <tr key={u.id}>
                  {/* A button, so the details open from the keyboard too. */}
                  <td><button type="button" className={own.open} aria-label={`مشخصات ${u.name}`} onClick={() => setOpenId(u.id)}>{u.name}</button></td>
                  <td className={`${styles.muted} ${own.ltr}`}>{u.phone}</td>
                  <td className={styles.muted}>{fmt(u.createdAt)}</td>
                  <td>{faNum(u.listingCount)}</td>
                  <td>{faNum(u.reviewCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className={own.pager}>
          <Button size="sm" intent="quiet" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>قبلی</Button>
          <span>{faNum(page)} / {faNum(pages)}</span>
          <Button size="sm" intent="quiet" onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}>بعدی</Button>
        </div>
      )}

      {openId != null && (
        <CustomerModal userId={openId} canManageAccess={canManageAccess} onClose={() => setOpenId(null)} onSaved={load} />
      )}
    </section>
  );
}

function AddAdminModal({ onClose, onCreated }: { onClose: () => void; onCreated: (a: AdminRow) => void }) {
  const [draft, setDraft] = useState({ name: "", email: "", role: "viewer" as StaffRole, password: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!draft.name.trim()) { setError("نام الزامی است"); return; }
    if (!draft.email.trim()) { setError("ایمیل الزامی است"); return; }
    if (draft.password.length < MIN_PASSWORD_LENGTH) { setError(PASSWORD_TOO_SHORT); return; }
    setError(""); setSaving(true);
    try {
      const data = await fetchJson<{ admin: AdminRow }>("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name.trim(), email: draft.email.trim(), role: draft.role, password: draft.password }),
      });
      onCreated(data.admin);
    } catch (err) { setError(errorMessage(err)); setSaving(false); }
  };

  return (
    <Dialog size="sm" icon={<Plus size={16} />} title="کاربر مدیریتی جدید" onClose={onClose}>
      <form className={form.stack} onSubmit={submit}>
        <div className={form.field}><label htmlFor="admn-name" className={form.label}>نام</label><input id="admn-name" className={form.input} value={draft.name} onChange={set("name")} /></div>
        <div className={form.field}><label htmlFor="admn-email" className={form.label}>ایمیل</label><input id="admn-email" className={`${form.input} ${form.ltr}`} value={draft.email} onChange={set("email")} type="email" autoComplete="off" /></div>
        <div className={form.field}><label htmlFor="admn-role" className={form.label}>نقش</label>
          <select id="admn-role" className={form.input} value={draft.role} onChange={set("role")}>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div className={form.field}><label htmlFor="admn-password" className={form.label}>رمز عبور (حداقل {faNum(MIN_PASSWORD_LENGTH)} نویسه)</label><input id="admn-password" className={`${form.input} ${form.ltr}`} value={draft.password} onChange={set("password")} type="password" autoComplete="new-password" /></div>
        {error && <div role="alert" className={form.error}><AlertTriangle size={13} /> {error}</div>}
        <div className={form.row}>
          <Button type="submit" intent="primary" disabled={saving}>{saving ? "در حال ساخت..." : "ساخت کاربر"}</Button>
          <Button intent="quiet" onClick={onClose}>انصراف</Button>
        </div>
      </form>
    </Dialog>
  );
}
