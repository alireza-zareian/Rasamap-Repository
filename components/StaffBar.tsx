"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, LayoutDashboard, ClipboardCheck, Handshake, PencilLine } from "lucide-react";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";

/**
 * A thin bar shown across the public site to whoever is signed in as staff —
 * the pattern WordPress and Django both use, and for the same reason: the team
 * spends most of its time looking at the site the way a visitor sees it, and
 * making them remember an admin URL to act on what they are looking at is how
 * things stop getting checked.
 *
 * It shows only to a staff session (GET /api/auth/me reports `isStaff`), it
 * never renders inside the panel itself, and every control is a link into the
 * panel. It grants nothing: each of those pages checks the session again, and
 * so does every API call behind them. This is a shortcut, not a permission.
 */
export default function StaffBar() {
  const { user } = useCurrentUser();
  const pathname = usePathname();

  if (!user?.isStaff) return null;
  if (pathname?.startsWith("/admin")) return null;

  const link: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 5,
    color: "rgba(255,255,255,0.92)", textDecoration: "none",
    fontSize: "0.72rem", fontWeight: 600, whiteSpace: "nowrap",
    padding: "3px 9px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.22)",
  };

  return (
    <div
      className="staff-bar"
      style={{
        position: "fixed", bottom: 0, right: 0, left: 0, zIndex: 200,
        background: "linear-gradient(90deg, #1E3A8A, #2F6BE0)",
        borderTop: "1px solid rgba(255,255,255,0.18)",
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 14px", overflowX: "auto",
        boxShadow: "0 -4px 18px rgba(0,0,0,0.25)",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#fff", fontSize: "0.72rem", fontWeight: 800, whiteSpace: "nowrap" }}>
        <ShieldCheck size={13} /> {user.name}
      </span>
      <span style={{ fontSize: "0.66rem", color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap" }}>
        نمای مدیریت
      </span>
      <div style={{ display: "flex", gap: 6, marginRight: "auto" }}>
        <Link href="/admin" style={link}><LayoutDashboard size={11} /> پنل</Link>
        <Link href="/admin?tab=listings" style={link}><ClipboardCheck size={11} /> تأیید آگهی‌ها</Link>
        <Link href="/admin?tab=leads" style={link}><Handshake size={11} /> سرنخ‌ها</Link>
        <Link href="/admin?tab=billboards" style={link}><PencilLine size={11} /> ویرایش رسانه‌ها</Link>
      </div>
    </div>
  );
}
