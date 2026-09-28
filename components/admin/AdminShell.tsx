"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, ClipboardList, ClipboardCheck, Handshake, ShieldCheck, Bot, Users, ScrollText, Globe, KeyRound } from "lucide-react";
import { fetchJson } from "@/lib/client/fetch-json";
import type { StaffRole } from "@/lib/domain/roles";
import { ROLE_LABEL, ROLE_COLOR } from "./constants";
import { Badge } from "./Badge";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { Button } from "@/components/ui/Button";
import styles from "./AdminShell.module.css";

/**
 * The panel's frame: top bar and section menu. Each section is its own route,
 * so it can be bookmarked and only its code is sent.
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
      // Leave anyway, as lib/client/use-current-user.tsx does.
    }
    router.push("/login?as=staff");
  };

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <Link href="/" className={styles.logo}>رسا<span>مپ</span></Link>
          <div className={styles.sep} />
          <span className={styles.sub}>پنل مدیریت</span>
        </div>
        <div className={styles.account}>
          <Badge text={ROLE_LABEL[user.role] ?? user.role} tone={ROLE_COLOR[user.role] ?? "var(--text-muted)"} />
          <div className={styles.name}>{user.name}</div>
          {/* In the top bar: on a phone the menu's foot is off screen. */}
          <Link href="/" className={styles.siteLink} aria-label="مشاهده سایت">
            <Globe size={13} /> <span className={styles.siteLabel}>مشاهده سایت</span>
          </Link>
          <Button size="sm" intent="quiet" onClick={() => setChangingPassword(true)} aria-label="تغییر رمز" title="تغییر رمز"><KeyRound size={14} /></Button>
          <Button size="sm" intent="quiet" onClick={handleLogout} disabled={loggingOut}>{loggingOut ? "..." : "خروج"}</Button>
        </div>
      </header>

      <div className={styles.body}>
        <nav className={styles.nav} aria-label="بخش‌های پنل">
          <div className={styles.navCard}>
            {ADMIN_SECTIONS.map(([label, href, Icon]) => {
              const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
              return (
                <Link key={href} href={href} className={styles.navLink} aria-current={active ? "page" : undefined}>
                  <Icon size={15} /> {label}
                </Link>
              );
            })}
          </div>
        </nav>

        <main className={styles.main}>{children}</main>
      </div>
      {changingPassword && <ChangePasswordModal onClose={() => setChangingPassword(false)} />}
    </div>
  );
}
