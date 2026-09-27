"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ShieldCheck, LayoutDashboard, ClipboardCheck, Handshake, PencilLine, BarChart3, Users } from "lucide-react";
import { useCurrentUser } from "@/lib/client/use-current-user";
import styles from "./StaffBar.module.css";

/**
 * A thin bar shown across the public site to whoever is signed in as staff —
 * the pattern WordPress and Django both use, and for the same reason: the team
 * spends most of its time looking at the site the way a visitor sees it, and
 * making them remember an admin URL to act on what they are looking at is how
 * things stop getting checked.
 *
 * The actions are **contextual**: standing on a listing offers to edit that
 * listing, standing on the catalogue offers the media table, and so on. A bar
 * that shows the same four links everywhere is a menu, not a tool.
 *
 * It grants nothing. Every destination checks the session again, and so does
 * every API behind it — this is a shortcut, not a permission. It renders only
 * for a staff session and never inside the panel itself.
 */

interface Action {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
}

/** What is worth offering while looking at this page. */
function actionsFor(pathname: string): { where: string; actions: Action[] } {
  if (pathname.startsWith("/billboard/")) {
    const slug = pathname.split("/")[2] ?? "";
    return {
      where: "صفحهٔ رسانه",
      actions: [
        { href: `/admin/billboards?q=${encodeURIComponent(slug)}`, label: "ویرایش همین رسانه", Icon: PencilLine },
        { href: "/admin/listings", label: "صف تأیید", Icon: ClipboardCheck },
        { href: "/admin/leads", label: "سرنخ‌ها", Icon: Handshake },
      ],
    };
  }
  if (pathname.startsWith("/explore") || pathname.startsWith("/compare")) {
    return {
      where: "کاتالوگ",
      actions: [
        { href: "/admin/billboards", label: "جدول رسانه‌ها", Icon: PencilLine },
        { href: "/admin/quality", label: "کنترل کیفیت", Icon: ShieldCheck },
        { href: "/admin/listings", label: "صف تأیید", Icon: ClipboardCheck },
      ],
    };
  }
  if (pathname.startsWith("/analytics")) {
    return {
      where: "تحلیل بازار",
      actions: [
        { href: "/admin", label: "آمار پنل", Icon: BarChart3 },
        { href: "/admin/leads", label: "سرنخ‌ها", Icon: Handshake },
      ],
    };
  }
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/list-media")) {
    return {
      where: "ناحیهٔ کاربر",
      actions: [
        { href: "/admin/users", label: "کاربران", Icon: Users },
        { href: "/admin/listings", label: "صف تأیید", Icon: ClipboardCheck },
      ],
    };
  }
  return {
    where: "سایت عمومی",
    actions: [
      { href: "/admin", label: "پنل مدیریت", Icon: LayoutDashboard },
      { href: "/admin/listings", label: "صف تأیید", Icon: ClipboardCheck },
      { href: "/admin/leads", label: "سرنخ‌ها", Icon: Handshake },
    ],
  };
}

export default function StaffBar() {
  const { user } = useCurrentUser();
  const pathname = usePathname() ?? "/";
  const barRef = useRef<HTMLDivElement>(null);

  const visible = !!user?.isStaff && !pathname.startsWith("/admin");

  // A fixed bar at the bottom of the viewport sits on top of whatever the page
  // put there — the footer's last row, or a page short enough that the bar
  // lands on the content itself. The page cannot be trusted to leave room for
  // it (every page would have to know a staff session exists), so the bar
  // reserves its own space: it measures its real height — which text wrapping,
  // font loading or a future extra action could change — and writes it to a
  // CSS variable that a global rule turns into bottom padding on <body>. Hidden
  // (a customer, or the admin panel itself) removes both, exactly once.
  useEffect(() => {
    const root = document.documentElement;
    if (!visible) {
      root.classList.remove("has-staffbar");
      root.style.removeProperty("--staffbar-h");
      return;
    }
    const el = barRef.current;
    if (!el) return;
    root.classList.add("has-staffbar");
    const sync = () => root.style.setProperty("--staffbar-h", `${el.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.classList.remove("has-staffbar");
      root.style.removeProperty("--staffbar-h");
    };
  }, [visible]);

  if (!visible) return null;

  const { where, actions } = actionsFor(pathname);

  return (
    <div ref={barRef} className={styles.bar} role="navigation" aria-label="میان‌بُرهای همکاران">
      <span className={styles.who}><ShieldCheck size={13} /> {user.name}</span>
      <span className={styles.where}>{where}</span>
      <div className={styles.actions}>
        {actions.map(a => (
          <Link key={a.href} href={a.href} className={styles.action}><a.Icon size={11} /> {a.label}</Link>
        ))}
      </div>
    </div>
  );
}
