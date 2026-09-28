"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, User } from "lucide-react";
import { useCurrentUser } from "@/lib/client/use-current-user";
import { SECTIONS, isCurrent } from "./Topbar";
import styles from "./chrome.module.css";

/**
 * The phone's tab bar: every section labelled at thumb size, listing a board in
 * the middle. Hidden above 768px, where the top bar has room.
 */
export default function BottomNav() {
  const pathname = usePathname() ?? "/";
  const { user } = useCurrentUser();
  const [explore, analytics, compare] = SECTIONS;
  const account = user?.isStaff ? "/admin" : user ? "/dashboard" : "/login";

  const item = (section: { href: string; label: string; within?: readonly string[] }, icon: React.ReactNode, extra = "") => {
    const current = isCurrent(pathname, section);
    return (
      <Link href={section.href} className={`${styles.navItem} ${current ? styles.navActive : ""} ${extra}`}
        aria-current={current ? "page" : undefined}>
        {icon}
        <span>{section.label}</span>
      </Link>
    );
  };

  return (
    <nav className={styles.bottomNav} aria-label="بخش‌های سایت">
      {item(explore, <explore.Icon size={20} />)}
      {item(analytics, <analytics.Icon size={20} />)}
      {item({ href: "/list-media", label: "ثبت رسانه" }, <Plus />, styles.navCta)}
      {item(compare, <compare.Icon size={20} />)}
      {item({ href: account, label: user ? "حساب من" : "ورود" }, <User size={20} />)}
    </nav>
  );
}
