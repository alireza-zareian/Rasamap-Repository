"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, ClipboardList, ClipboardCheck, Handshake, ShieldCheck, Bot, Users, ScrollText, Globe, KeyRound } from "lucide-react";
import { fetchJson } from "@/lib/client/fetch-json";
import type { StaffRole } from "@/lib/domain/roles";
import { C, ROLE_LABEL, ROLE_COLOR } from "./constants";
import { Badge } from "./Badge";
import { ChangePasswordModal } from "./ChangePasswordModal";

/**
 * The frame every panel section renders inside: the top bar and the section
 * menu. Each section is its own route under /admin, so the menu is links —
 * a section can be bookmarked, opened in a new tab and reached with the back
 * button, and only the code for the section in view is sent to the browser.
 */
const ADMIN_SECTIONS: [label: string, href: string, Icon: React.ComponentType<{ size?: number }>][] = [
  ["نمای کلی",       "/admin",            LayoutDashboard],
  ["بیلبوردها",      "/admin/billboards", ClipboardList],
  ["تأیید آگهی‌ها",  "/admin/listings",   ClipboardCheck],
  ["سرنخ‌ها",        "/admin/leads",      Handshake],
  ["کیفیت",          "/admin/quality",    ShieldCheck],
  ["اسکرپر",         "/admin/scraper",    Bot],
  ["کاربران",        "/admin/users",      Users],
  ["لاگ",            "/admin/audit",      ScrollText],
];

export function AdminShell({ user, children }: { user: { name: string; role: StaffRole }; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetchJson("/api/admin/auth/logout", { method: "POST" });
    } catch {
      // Leaving is not negotiable — see the same reasoning in
      // lib/client/use-current-user.tsx. A hung request must not strand someone
      // on a panel they asked to leave, with a dead button and no explanation.
    }
    router.push("/admin/login");
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: C.font, direction: "rtl", color: C.text }}>
      <div className="admin-topbar" style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: "0 28px", minHeight: 60, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
          <Link href="/" style={{ textDecoration: "none", color: C.text, fontSize: "1.1rem", fontWeight: 800 }}>رسا<span style={{ color: C.accent }}>مپ</span></Link>
          <div className="admin-topbar-sep" style={{ width: 1, height: 24, background: C.border }} />
          <span className="admin-topbar-sub" style={{ fontSize: "0.8rem", color: C.muted, fontWeight: 600 }}>پنل مدیریت</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Badge text={ROLE_LABEL[user.role] ?? user.role} color={ROLE_COLOR[user.role] ?? C.muted} bg={`${ROLE_COLOR[user.role] ?? C.muted}18`} />
          <div className="admin-topbar-name" style={{ fontSize: "0.78rem", color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
          {/* In the sticky top bar rather than at the foot of the menu, which on
              a phone collapses into a row of buttons and pushes it off screen. */}
          <Link href="/" className="admin-topbar-sitelink" aria-label="مشاهده سایت" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.75rem", fontWeight: 600, padding: "6px 12px", borderRadius: 7, border: `1px solid ${C.accent}55`, background: `${C.accent}12`, color: C.accent, textDecoration: "none", flexShrink: 0, whiteSpace: "nowrap" }}>
            <Globe size={13} /> <span className="admin-topbar-sitelink-label">مشاهده سایت</span>
          </Link>
          <button onClick={() => setChangingPassword(true)} aria-label="تغییر رمز" title="تغییر رمز" style={{ display: "inline-flex", alignItems: "center", padding: "6px 9px", borderRadius: 7, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer", flexShrink: 0 }}>
            <KeyRound size={14} />
          </button>
          <button onClick={handleLogout} disabled={loggingOut} style={{ fontSize: "0.75rem", padding: "6px 12px", borderRadius: 7, border: `1px solid ${C.border}`, background: "none", color: C.muted, fontFamily: C.font, cursor: "pointer", flexShrink: 0 }}>
            {loggingOut ? "..." : "خروج"}
          </button>
        </div>
      </div>

      <div className="admin-shell" style={{ display: "flex", maxWidth: 1400, margin: "0 auto", padding: "24px 20px", gap: 20 }}>
        <nav className="admin-sidebar" aria-label="بخش‌های پنل" style={{ width: 200, flexShrink: 0 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 8, position: "sticky", top: 76 }}>
            {ADMIN_SECTIONS.map(([label, href, Icon]) => {
              const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
              return (
                <Link key={href} href={href} aria-current={active ? "page" : undefined} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "right", padding: "10px 14px", borderRadius: 8, fontSize: "0.82rem", fontWeight: active ? 700 : 400, color: active ? C.accent : C.muted, background: active ? "rgba(255,77,0,0.08)" : "none", textDecoration: "none", marginBottom: 2, boxSizing: "border-box" }}>
                  <Icon size={15} /> {label}
                </Link>
              );
            })}
          </div>
        </nav>

        <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
      </div>
      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
    </div>
  );
}
