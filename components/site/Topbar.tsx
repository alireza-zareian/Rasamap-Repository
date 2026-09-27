"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Map, BarChart2, Scale, Sun, Moon, User, LogOut } from "lucide-react";
import { useTheme } from "@/lib/client/theme";
import { useCurrentUser } from "@/lib/client/use-current-user";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Logo } from "./Logo";
import styles from "./chrome.module.css";

/**
 * The public sections. `within` names the pages that belong to a section
 * without living under its address: a media page is opened from the
 * catalogue, so the visitor is still "in" it there.
 */
export const SECTIONS: readonly { href: string; label: string; Icon: typeof Map; within?: readonly string[] }[] = [
  { href: "/explore",   label: "کاوش",   Icon: Map, within: ["/billboard"] },
  { href: "/analytics", label: "تحلیل",  Icon: BarChart2 },
  { href: "/compare",   label: "مقایسه", Icon: Scale },
];

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** Whether the visitor is in `section` (a SECTIONS entry, or any bare `{ href }`). */
export function isCurrent(pathname: string, section: { href: string; within?: readonly string[] }): boolean {
  return under(pathname, section.href) || (section.within ?? []).some(p => under(pathname, p));
}

/**
 * The bar across the top of every public page. On the landing page it starts
 * transparent over the hero and turns solid once the visitor scrolls; there
 * used to be a second, hand-built header there that drifted from this one.
 *
 * On a phone the section links move to the tab bar at the bottom (BottomNav),
 * where a thumb reaches them, and this keeps the logo, the theme and the account.
 */
export default function Topbar() {
  const pathname = usePathname() ?? "/";
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const { user, logout } = useCurrentUser();
  const overHero = pathname === "/";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!overHero) return;
    // Flips state twice in all, not on every scroll frame.
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [overHero]);

  return (
    <header className={`${styles.topbar} ${overHero && !scrolled ? styles.overlay : ""}`}>
      <Logo sub />

      <nav className={styles.tabs} aria-label="بخش‌های سایت">
        {SECTIONS.map(section => {
          const { href, label, Icon } = section;
          const current = isCurrent(pathname, section);
          return (
            <Link key={href} href={href} className={`${styles.tab} ${current ? styles.tabActive : ""}`}
              aria-current={current ? "page" : undefined}>
              <Icon size={14} /> {label}
            </Link>
          );
        })}
      </nav>

      <div className={styles.actions}>
        <button type="button" className={styles.iconButton} onClick={toggle} aria-label={dark ? "تغییر به تم روشن" : "تغییر به تم تاریک"}>
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <ButtonLink href="/list-media" size="sm" className={styles.desktopOnly}>ثبت رسانه</ButtonLink>
        <div className={styles.accountSlot}>
          {user ? (
            <>
              <Link href={user.isStaff ? "/admin" : "/dashboard"} className={styles.account}>
                <User size={14} /> {user.name.split(" ")[0]}
              </Link>
              <Button intent="quiet" size="sm" className={styles.desktopOnly} onClick={logout} aria-label="خروج از حساب کاربری">
                <LogOut size={13} /> خروج
              </Button>
            </>
          ) : user === null ? (
            <ButtonLink href="/login" intent="primary" size="sm">ورود</ButtonLink>
          ) : null}
        </div>
      </div>
    </header>
  );
}
