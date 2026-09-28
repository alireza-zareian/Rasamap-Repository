"use client";
import { useState } from "react";
import { fetchJson, errorMessage } from "@/lib/client/fetch-json";
import Image from "next/image";
import Link from "next/link";
import { Megaphone, Monitor, Milestone, Train, Bus, LayoutList, Clock, Settings2, CheckCircle2, Plus, Sparkles, ArrowLeft } from "lucide-react";
import { moderationLabels, planLabels } from "@/lib/types";
import EditListingModal from "@/components/account/EditListingModal";
import UserAvatar from "@/components/account/UserAvatar";
import { faNum } from "@/lib/format";
import { MIN_PASSWORD_LENGTH } from "@/lib/domain/password";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cssVar } from "@/components/ui/css-var";
import form from "@/components/ui/form.module.css";
import styles from "./DashboardClient.module.css";

// One of the customer's own submissions, with its editable fields for a revision.
export interface Listing {
  id: number;
  slug: string;
  name: string;
  city: string;
  type: string;
  price: number;
  moderation: string;
  plan: string;
  featured: boolean;
  image: string | null;
  createdAt: string;
  reviewNote: string | null;
  description: string;
  phone: string;
  region: string;
  location: string;
  width: number;
  height: number;
  faces: number;
  images: string[];
  lat: number | null;
  lng: number | null;
}

const STATUS_TONE: Record<string, string> = {
  pending:          "#f59e0b",
  awaiting_payment: "#f59e0b",
  approved:         "var(--green)",
  rejected:         "var(--red)",
  needs_revision:   "#f97316",
  suspended:        "var(--text-muted)",
};
// What the submitter should do next, per state.
const STATUS_HINT: Record<string, string> = {
  pending:          "کارشناسان رسامپ در حال بررسی محتوای آگهی هستند.",
  awaiting_payment: "برای فعال شدن پلن ویژه، هزینه را واریز کنید و رسید را برای پشتیبانی بفرستید.",
  approved:         "آگهی شما منتشر شده و در جستجو دیده می‌شود.",
  rejected:         "این آگهی تأیید نشد. برای پیگیری با پشتیبانی تماس بگیرید.",
  needs_revision:   "کارشناس از شما خواسته آگهی را اصلاح کنید. توضیح زیر را بخوانید، آگهی را ویرایش کنید و دوباره بفرستید.",
  suspended:        "نمایش این آگهی توسط تیم رسامپ متوقف شده است. دلیل در توضیح زیر آمده؛ برای پیگیری با پشتیبانی تماس بگیرید.",
};
const TYPE_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  billboard: Megaphone, digital: Monitor, bridge: Milestone, station: Train, vehicle: Bus,
};

type Tab = "listings" | "settings";
const TABS: [string, Tab, React.ComponentType<{ size?: number }>][] = [
  ["آگهی‌های من", "listings", LayoutList],
  ["ویرایش پروفایل", "settings", Settings2],
];

/**
 * The customer's dashboard: listings and profile, read on the server by
 * app/(site)/dashboard/page.tsx; the API is called only for changes.
 */
export default function DashboardClient({ account, initialListings }: {
  account: { name: string; phone: string };
  initialListings: Listing[];
}) {
  const [tab, setTab] = useState<Tab>("listings");
  const [user, setUser] = useState(account);
  const [listings, setListings] = useState<Listing[]>(initialListings);
  // The "needs_revision" listing currently open in the edit-and-resubmit modal.
  const [editing, setEditing] = useState<Listing | null>(null);

  // Profile edit state
  const [editName, setEditName]               = useState(account.name);
  const [editCurPass, setEditCurPass]         = useState("");
  const [editNewPass, setEditNewPass]         = useState("");
  const [profileSaving, setProfileSaving]     = useState(false);
  const [profileSuccess, setProfileSuccess]   = useState("");
  const [profileError, setProfileError]       = useState("");

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profileSaving) return;
    setProfileError(""); setProfileSuccess(""); setProfileSaving(true);
    const body: Record<string, string> = {};
    if (editName.trim() && editName.trim() !== user.name) body.name = editName.trim();
    if (editNewPass) { body.currentPassword = editCurPass; body.newPassword = editNewPass; }
    if (!Object.keys(body).length) { setProfileError("تغییری وارد نکرده‌اید"); setProfileSaving(false); return; }
    try {
      const data = await fetchJson<{ user: { name: string; phone: string } }>("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setUser(data.user);
      setEditName(data.user.name);
      setEditCurPass(""); setEditNewPass("");
      setProfileSuccess("اطلاعات با موفقیت ذخیره شد");
    } catch (err) { setProfileError(errorMessage(err)); }
    finally { setProfileSaving(false); }
  };

  const underReview = listings.filter(l => l.moderation === "pending" || l.moderation === "awaiting_payment").length;
  const published   = listings.filter(l => l.moderation === "approved").length;

  return (
    <main className={styles.page}>
      <div className={styles.head}>
        <UserAvatar name={user.name} size={44} />
        <div className={styles.who}>
          <h1 className={styles.greeting}>خوش آمدید، {user.name}</h1>
          <div className={styles.phone}>{user.phone}</div>
        </div>
      </div>

      {/* Two sections, as tabs. */}
      <div className={styles.tabs} role="tablist" aria-label="بخش‌های داشبورد">
        {TABS.map(([label, key, Icon]) => (
          <button key={key} type="button" role="tab" id={`dash-${key}`} aria-selected={tab === key} className={styles.tab} onClick={() => setTab(key)}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === "listings" && (
        <div role="tabpanel" aria-labelledby="dash-listings">
          <div className={styles.stats}>
            {[
              { Icon: LayoutList, label: "کل آگهی‌ها", val: listings.length, color: "var(--accent)" },
              { Icon: Clock, label: "در انتظار بررسی", val: underReview, color: "#f59e0b" },
              { Icon: CheckCircle2, label: "منتشر شده", val: published, color: "var(--green)" },
            ].map(s => (
              <div key={s.label} className={styles.stat} style={cssVar("--tone", s.color)}>
                <s.Icon size={22} />
                <strong>{faNum(s.val)}</strong>
                <span>{s.label}</span>
              </div>
            ))}
          </div>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>آگهی‌های من</h2>
              <ButtonLink href="/list-media" intent="primary" size="sm"><Plus size={14} /> ثبت رسانه جدید</ButtonLink>
            </div>
            {listings.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}><LayoutList size={26} /></div>
                <h3>هنوز آگهی ثبت نکرده‌اید</h3>
                <p>رسانه تبلیغاتی خود را ثبت کنید<br />تا در جستجوی رسامپ دیده شود</p>
                <ButtonLink href="/list-media" intent="primary"><Plus size={14} /> ثبت رسانه</ButtonLink>
              </div>
            ) : (
              <ul className={styles.listings}>
                {listings.map(l => {
                  const isPublished = l.moderation === "approved";
                  const Icon = TYPE_ICON[l.type] ?? Megaphone;
                  return (
                    <li key={l.id} className={styles.listing}>
                      <div className={styles.listingRow}>
                        <div className={styles.thumb}>
                          {l.image
                            ? <Image src={l.image} alt="" fill sizes="64px" loading="lazy" decoding="async" />
                            : <Icon size={20} />}
                        </div>
                        <div className={styles.info}>
                          {/* Only a published listing has a page to link to. */}
                          {isPublished
                            ? <Link href={`/billboard/${l.slug}`} className={styles.name}>{l.name}</Link>
                            : <div className={styles.name}>{l.name}</div>}
                          <div className={styles.meta}>{l.city} · {faNum(l.price)}M تومان/ماه · {new Date(l.createdAt).toLocaleDateString("fa-IR")}</div>
                        </div>
                        <div className={styles.state}>
                          <span className={styles.badge} style={cssVar("--tone", STATUS_TONE[l.moderation] ?? "var(--text-muted)")}>
                            {moderationLabels[l.moderation] ?? l.moderation}
                          </span>
                          {l.featured
                            ? <span className={styles.featured}><Sparkles size={10} /> ویژه</span>
                            : <span className={styles.plan}>پلن {planLabels[l.plan] ?? l.plan}</span>}
                        </div>
                      </div>
                      {STATUS_HINT[l.moderation] && <div className={styles.strip}>{STATUS_HINT[l.moderation]}</div>}
                      {l.reviewNote && (l.moderation === "needs_revision" || l.moderation === "rejected") && (
                        <div className={`${styles.strip} ${styles.note}`}><b>پیام کارشناس رسامپ:</b> {l.reviewNote}</div>
                      )}
                      {l.moderation === "needs_revision" && (
                        <div className={styles.strip}>
                          <Button intent="primary" size="sm" onClick={() => setEditing(l)}>ویرایش و ارسال مجدد</Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === "settings" && (
        <section className={styles.card} role="tabpanel" aria-labelledby="dash-settings">
          <h2 className={`${styles.cardTitle} ${styles.settingsTitle}`}>ویرایش پروفایل</h2>
          <form className={styles.form} onSubmit={handleProfileSave}>
            {profileSuccess && <div role="status" className={form.success}>{profileSuccess}</div>}
            {profileError && <div role="alert" className={form.error}>{profileError}</div>}
            <div className={form.field}>
              <label htmlFor="profile-name" className={form.label}>نام و نام خانوادگی</label>
              <input id="profile-name" className={form.input} value={editName} onChange={e => setEditName(e.target.value)} autoComplete="name" />
            </div>
            <div className={form.field}>
              <label htmlFor="profile-phone" className={form.label}>شماره موبایل (غیرقابل تغییر)</label>
              <input id="profile-phone" className={`${form.input} ${form.ltr}`} value={user.phone} readOnly dir="ltr" />
            </div>
            <div className={styles.divider}>تغییر رمز عبور (اختیاری)</div>
            <div className={form.field}>
              <label htmlFor="profile-current" className={form.label}>رمز فعلی</label>
              <input id="profile-current" className={form.input} type="password" autoComplete="current-password"
                value={editCurPass} onChange={e => setEditCurPass(e.target.value)} placeholder="••••••••" />
            </div>
            <div className={form.field}>
              <label htmlFor="profile-new" className={form.label}>رمز جدید (حداقل {faNum(MIN_PASSWORD_LENGTH)} نویسه)</label>
              <input id="profile-new" className={form.input} type="password" autoComplete="new-password"
                value={editNewPass} onChange={e => setEditNewPass(e.target.value)} placeholder="••••••••" />
            </div>
            <Button type="submit" intent="primary" className={styles.save} disabled={profileSaving}>
              {profileSaving ? "در حال ذخیره..." : "ذخیره تغییرات"}
            </Button>
          </form>
        </section>
      )}

      <div className={styles.more}>
        <Link href="/explore" className={styles.moreLink}><ArrowLeft size={13} /> جستجوی رسانه</Link>
      </div>

      {editing && (
        <EditListingModal
          listing={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setListings(prev => prev.map(l => (l.id === (updated.id as number) ? { ...l, ...(updated as Partial<Listing>) } : l)));
            setEditing(null);
          }}
        />
      )}
    </main>
  );
}
