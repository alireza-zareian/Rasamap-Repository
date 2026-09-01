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

export const STATUS_LABEL: Record<string, string> = {
  available: "موجود", busy: "مشغول", reserved: "رزرو", inactive: "غیرفعال",
};
export const STATUS_COLOR: Record<string, [string, string]> = {
  available: [C.green,  "rgba(34,197,94,0.12)"],
  busy:      ["#f59e0b","rgba(245,158,11,0.12)"],
  reserved:  ["#8b5cf6","rgba(139,92,246,0.12)"],
  inactive:  [C.muted,  "rgba(148,163,184,0.12)"],
};
export const TYPE_LABEL: Record<string, string> = {
  billboard: "بیلبورد", digital: "دیجیتال", bridge: "عرشه پل", station: "ایستگاه", vehicle: "وسیله",
};
export const TYPE_ICON: Record<string, string> = {
  billboard: "🏙️", digital: "📺", bridge: "🌉", station: "🚇", vehicle: "🚌",
};
export const ROLE_LABEL: Record<string, string> = {
  super_admin: "سوپر ادمین", admin: "ادمین", editor: "ویرایشگر", viewer: "بیننده",
};
export const ROLE_COLOR: Record<string, string> = {
  super_admin: "#ef4444", admin: "var(--accent)", editor: "#8b5cf6", viewer: "var(--text-muted)",
};
