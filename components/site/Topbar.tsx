"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Map, BarChart2, Megaphone, Heart, Sun, Moon, User, LogOut } from "lucide-react";
import { useCampaign } from "@/lib/client/use-campaign";
import { useFavorites } from "@/components/favorites/FavoritesProvider";
import { faNum } from "@/lib/format";
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
  { href: "/campaign",  label: "کمپین",  Icon: Megaphone, within: ["/compare"] },
  { href: "/saved",     label: "ذخیره‌ها", Icon: Heart },
];

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** Whether the visitor is in `section` (a SECTIONS entry, or any bare `{ href }`). */
export function isCurrent(pathname: string, section: { href: string; within?: readonly string[] }): boolean {
  return under(pathname, section.href) || (section.within ?? []).some(p => under(pathname, p));
}

/** How many items the campaign and saved sections hold, for the badge on their tab. */
export function useSectionCounts(): Record<string, number> {
  const { items } = useCampaign();
  const { count } = useFavorites();
  return { "/campaign": items.length, "/saved": count };
}

/**
 * The bar across every public page. Scrolled, it floats off the edges; on the
 * landing it is transparent until then. On a phone the section links move to
 * BottomNav.
 */
export default function Topbar() {
  const pathname = usePathname() ?? "/";
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const { user, logout } = useCurrentUser();
  const counts = useSectionCounts();
  const overHero = pathname === "/";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // Renders only when the answer flips, not on every scroll frame: React
    // skips a set to the value it already holds.
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const shape = scrolled ? styles.floating : overHero ? styles.overlay : "";
  return (
    <header className={`${styles.topbar} ${shape}`}>
      <Logo sub />

      <nav className={styles.tabs} aria-label="بخش‌های سایت">
        {SECTIONS.map(section => {
          const { href, label, Icon } = section;
          const current = isCurrent(pathname, section);
          const count = counts[href] ?? 0;
          return (
            <Link key={href} href={href} className={`${styles.tab} ${current ? styles.tabActive : ""}`}
              aria-current={current ? "page" : undefined}>
              <Icon size={14} /> {label}
              {count > 0 && <span className={styles.badge} aria-label={`${faNum(count)} مورد`}>{faNum(count)}</span>}
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
