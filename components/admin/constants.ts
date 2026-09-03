export const C = {
  bg:      "var(--bg-deep)",
  card:    "var(--bg-card)",
  surface: "var(--bg-surface)",
  border:  "var(--border)",
  accent:  "var(--accent)",
  green:   "var(--green)",
  red:     "#ef4444",
  yellow:  "#f59e0b",
  purple:  "#8b5cf6",
  text:    "var(--text-main)",
  muted:   "var(--text-muted)",
  font:    "Vazirmatn, sans-serif",
} as const;

// One label map for the whole app — the admin filter, the edit modal's status
// select and the row badge all read it, so a status cannot be spelled two ways.
export { statusLabels as STATUS_LABEL } from "@/lib/types";

export const STATUS_COLOR: Record<string, [string, string]> = {
  pending:          ["#f59e0b","rgba(245,158,11,0.16)"],
  awaiting_payment: ["#8b5cf6","rgba(139,92,246,0.16)"],
  available:        [C.green,  "rgba(34,197,94,0.12)"],
  busy:             ["#f59e0b","rgba(245,158,11,0.12)"],
  reserved:         ["#8b5cf6","rgba(139,92,246,0.12)"],
  inactive:         [C.muted,  "rgba(148,163,184,0.12)"],
  rejected:         ["#ef4444","rgba(239,68,68,0.12)"],
  needs_revision:   ["#f97316","rgba(249,115,22,0.12)"],
};
export const TYPE_LABEL: Record<string, string> = {
  billboard: "بیلبورد", digital: "دیجیتال", bridge: "عرشه پل", station: "ایستگاه", vehicle: "وسیله",
};
export const ROLE_LABEL: Record<string, string> = {
  super_admin: "سوپر ادمین", admin: "ادمین", editor: "ویرایشگر", viewer: "بیننده",
};
export const ROLE_COLOR: Record<string, string> = {
  super_admin: "#ef4444", admin: "var(--accent)", editor: "#8b5cf6", viewer: "var(--text-muted)",
};

// Plain-Persian gloss for every audit action, so an admin who cannot read the
// English event name still understands what the line means. `title` is a short
// label, `desc` is one sentence of context. Keys match AuditAction in
// lib/auth/audit.ts — keep the two in sync.
export const AUDIT_ACTION: Record<string, { title: string; desc: string }> = {
  login_success:           { title: "ورود موفق",              desc: "یک مدیر با ایمیل و رمز درست وارد پنل شد." },
  login_failure:           { title: "ورود ناموفق",            desc: "تلاش برای ورود با ایمیل یا رمز اشتباه رد شد." },
  logout:                  { title: "خروج",                   desc: "یک مدیر از حساب خودش خارج شد." },
  billboard_create:        { title: "ساخت رسانه",             desc: "یک بیلبورد تازه به دیتابیس اضافه شد." },
  billboard_update:        { title: "ویرایش رسانه",           desc: "مشخصات یک بیلبورد (قیمت، مکان، وضعیت و…) تغییر کرد." },
  billboard_delete:        { title: "حذف رسانه",              desc: "یک بیلبورد برای همیشه از دیتابیس پاک شد." },
  listing_approved:        { title: "تأیید آگهی",             desc: "آگهی‌ای که یک کاربر ثبت کرده بود تأیید و منتشر شد." },
  listing_rejected:        { title: "رد آگهی",                desc: "آگهی‌ای که یک کاربر ثبت کرده بود رد شد." },
  listing_revision_requested: { title: "درخواست اصلاح آگهی", desc: "آگهی با توضیح کارشناس به فرستنده برگردانده شد تا ویرایش و دوباره ارسال کند." },
  listing_resubmitted:     { title: "ارسال مجدد آگهی",       desc: "کاربر آگهیِ برگشت‌خورده را ویرایش کرد و دوباره برای بررسی فرستاد." },
  admin_access:            { title: "ورود به پنل مدیریت",     desc: "یک مدیر به یکی از بخش‌های پنل دسترسی گرفت." },
  admin_user_create:       { title: "ساخت حساب مدیر",         desc: "یک حساب تازه برای تیم مدیریت ساخته شد." },
  admin_user_update:       { title: "ویرایش حساب مدیر",       desc: "نقش یا مشخصات یک حساب مدیریت عوض شد." },
  customer_update:         { title: "ویرایش حساب کاربر",      desc: "مشخصات حساب یک کاربر عادی توسط مدیر تغییر کرد." },
  customer_password_reset: { title: "بازنشانی رمز کاربر",     desc: "رمز عبور یک کاربر توسط مدیر از نو تنظیم شد." },
  password_reset_self:     { title: "تغییر رمز توسط خود کاربر", desc: "یک کاربر رمز عبور حساب خودش را عوض کرد." },
  otp_sent:                { title: "ارسال کد ورود",          desc: "یک کد یک‌بارمصرف برای ورود کاربر فرستاده شد." },
  rate_limit_hit:          { title: "سقف درخواست پر شد",      desc: "یک آی‌پی بیش از حد مجاز درخواست فرستاد و موقتاً محدود شد." },
  auth_bypass_attempt:     { title: "تلاش برای دور زدن ورود", desc: "یک درخواست بدون احراز هویت به مسیر محافظت‌شده رسید؛ نشانهٔ احتمالی نفوذ." },
};
