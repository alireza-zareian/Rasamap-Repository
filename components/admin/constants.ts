import type { AuditAction } from "@/lib/audit";
import { typeLabels } from "@/lib/types";

// The panel reads the same label maps as the public site (lib/types.ts).

export { availabilityLabels as AVAILABILITY_LABEL, moderationLabels as MODERATION_LABEL } from "@/lib/types";

/** Indexed with plain strings read back from the API, hence the wider type. */
export const TYPE_LABEL: Record<string, string> = typeLabels;

// Availability uses the public site's colours (components/ui/availability.ts).
export const MODERATION_TONE: Record<string, string> = {
  pending:          "#f59e0b",
  awaiting_payment: "#8b5cf6",
  needs_revision:   "#f97316",
  rejected:         "var(--red)",
  approved:         "var(--green)",
  suspended:        "var(--text-muted)",
};
export const moderationTone = (m: string) => MODERATION_TONE[m] ?? "var(--text-muted)";

export const ROLE_LABEL: Record<string, string> = {
  super_admin: "سوپر ادمین", admin: "ادمین", editor: "ویرایشگر", viewer: "بیننده",
};
export const ROLE_COLOR: Record<string, string> = {
  super_admin: "var(--red)", admin: "var(--accent)", editor: "#8b5cf6", viewer: "var(--text-muted)",
};

// A Persian title and sentence for every audit action; `satisfies` requires one
// per AuditAction (lib/audit.ts).
export const AUDIT_ACTION = {
  login_success:           { title: "ورود موفق",              desc: "یک حساب (کاربر یا عضو تیم) با رمز درست وارد شد." },
  login_failure:           { title: "ورود ناموفق",            desc: "تلاش برای ورود با شماره/ایمیل یا رمز اشتباه رد شد." },
  logout:                  { title: "خروج",                   desc: "یک حساب از نشست خودش خارج شد." },
  billboard_create:        { title: "ساخت رسانه",             desc: "یک بیلبورد تازه به دیتابیس اضافه شد." },
  billboard_update:        { title: "ویرایش رسانه",           desc: "مشخصات یک بیلبورد (قیمت، مکان، وضعیت و…) تغییر کرد." },
  billboard_images_update: { title: "تغییر تصاویر رسانه",     desc: "تصاویر یک رسانه جایگزین یا مرتب شد." },
  billboard_delete:        { title: "حذف رسانه",              desc: "یک بیلبورد برای همیشه از دیتابیس پاک شد." },
  billboard_suspended:     { title: "توقف انتشار رسانه",      desc: "یک رسانهٔ منتشرشده از دید بازدیدکنندگان خارج شد؛ ردیف، نظرها و سرنخ‌هایش باقی است." },
  billboard_restored:      { title: "انتشار دوبارهٔ رسانه",    desc: "رسانه‌ای که متوقف شده بود دوباره منتشر شد." },
  review_delete:           { title: "حذف نظر",                desc: "یک عضو تیم نظر یک کاربر را حذف کرد و امتیاز رسانه دوباره محاسبه شد." },
  listing_approved:        { title: "تأیید آگهی",             desc: "آگهی‌ای که یک کاربر ثبت کرده بود تأیید و منتشر شد." },
  listing_rejected:        { title: "رد آگهی",                desc: "آگهی‌ای که یک کاربر ثبت کرده بود رد شد." },
  listing_revision_requested: { title: "درخواست اصلاح آگهی", desc: "آگهی با توضیح کارشناس به فرستنده برگردانده شد تا ویرایش و دوباره ارسال کند." },
  listing_resubmitted:     { title: "ارسال مجدد آگهی",       desc: "کاربر آگهیِ برگشت‌خورده را ویرایش کرد و دوباره برای بررسی فرستاد." },
  admin_user_create:       { title: "ساخت حساب مدیر",         desc: "یک حساب تازه برای تیم مدیریت ساخته شد." },
  admin_user_update:       { title: "ویرایش حساب مدیر",       desc: "نقش یا مشخصات یک حساب مدیریت عوض شد." },
  customer_update:         { title: "ویرایش حساب کاربر",      desc: "مشخصات حساب یک کاربر عادی توسط مدیر تغییر کرد." },
  lead_update:             { title: "به‌روزرسانی سرنخ",       desc: "وضعیت پیگیری یا یادداشت یک درخواست تماس تغییر کرد." },
  customer_password_reset: { title: "بازنشانی رمز کاربر",     desc: "رمز عبور یک کاربر توسط مدیر از نو تنظیم شد." },
  admin_password_change:   { title: "تغییر رمز کارمند",       desc: "یک عضو تیم رمز حساب خودش را عوض کرد؛ نشست‌های دیگرش بسته شد." },
  password_reset_self:     { title: "تغییر رمز توسط خود کاربر", desc: "یک کاربر رمز عبور حساب خودش را عوض کرد." },
  otp_sent:                { title: "ارسال کد ورود",          desc: "یک کد یک‌بارمصرف برای ورود کاربر فرستاده شد." },
  rate_limit_hit:          { title: "سقف درخواست پر شد",      desc: "یک آی‌پی بیش از حد مجاز درخواست فرستاد و موقتاً محدود شد." },
} satisfies Record<AuditAction, { title: string; desc: string }>;

/** The gloss for an action name read back from the log, which may predate the current list. */
export function auditGloss(action: string): { title: string; desc: string } | undefined {
  return Object.hasOwn(AUDIT_ACTION, action) ? AUDIT_ACTION[action as AuditAction] : undefined;
}
