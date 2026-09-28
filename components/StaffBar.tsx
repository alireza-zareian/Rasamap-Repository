"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ShieldCheck, LayoutDashboard, ClipboardCheck, Handshake, PencilLine, BarChart3, Users } from "lucide-react";
import { useCurrentUser } from "@/lib/client/use-current-user";
import styles from "./StaffBar.module.css";

/**
 * A thin bar on the public site for staff, with actions for the page in view
 * (on a listing: edit it). A shortcut, not a permission: every destination
 * checks the session again. Never shown inside the panel.
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

  // The bar is fixed, so it reserves its own room: it writes its measured height
  // to --staffbar-h, which globals.css turns into padding on <body>.
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
