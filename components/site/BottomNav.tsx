"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, User } from "lucide-react";
import { useCurrentUser } from "@/lib/client/use-current-user";
import { SECTIONS, isCurrent } from "./Topbar";
import styles from "./chrome.module.css";

/**
 * The tab bar at the bottom of a phone screen. The top bar used to squeeze the
 * three sections into unlabeled icons and drop "ثبت رسانه" — the one action the
 * supply side of the marketplace exists for — off a phone entirely. Here every
 * item has its label and a thumb-sized target, and listing a board sits in the
 * middle. Hidden above 768px, where the top bar has room for all of it.
 */
export default function BottomNav() {
  const pathname = usePathname() ?? "/";
  const { user } = useCurrentUser();
  const [explore, analytics, compare] = SECTIONS;
  const account = user?.isStaff ? "/admin" : user ? "/dashboard" : "/login";

  const item = (href: string, label: string, icon: React.ReactNode, extra = "") => (
    <Link href={href} className={`${styles.navItem} ${isCurrent(pathname, href) ? styles.navActive : ""} ${extra}`}
      aria-current={isCurrent(pathname, href) ? "page" : undefined}>
      {icon}
      <span>{label}</span>
    </Link>
  );

  return (
    <nav className={styles.bottomNav} aria-label="بخش‌های سایت">
      {item(explore.href, explore.label, <explore.Icon size={20} />)}
      {item(analytics.href, analytics.label, <analytics.Icon size={20} />)}
      {item("/list-media", "ثبت رسانه", <Plus />, styles.navCta)}
      {item(compare.href, compare.label, <compare.Icon size={20} />)}
      {item(account, user ? "حساب من" : "ورود", <User size={20} />)}
    </nav>
  );
}
