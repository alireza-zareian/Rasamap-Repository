"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/lib/theme";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import { Map, BarChart2, Scale, Sun, Moon, User, LogOut } from "lucide-react";

interface Props { activeTab?: string; onTabChange?: (t: string) => void; onAddListing?: () => void; }

export default function Topbar({ }: Props) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const { user, logout } = useCurrentUser();

  const activeTab = pathname.startsWith("/analytics") ? "analytics"
    : pathname.startsWith("/compare") ? "compare"
    : "explore";

  const tabs = [
    { id: "explore",   label: "کاوش",   Icon: Map,      href: "/explore" },
    { id: "analytics", label: "تحلیل",  Icon: BarChart2, href: "/analytics" },
    { id: "compare",   label: "مقایسه", Icon: Scale,    href: "/compare" },
  ];

  const btn = (style: React.CSSProperties, onClick: () => void, children: React.ReactNode) => (
    <button onClick={onClick} style={{ fontFamily: "inherit", cursor: "pointer", transition: "all 0.2s", ...style }}>{children}</button>
  );

  return (
    <header style={{ position: "fixed", top: 0, right: 0, left: 0, zIndex: 100, backdropFilter: "blur(16px)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: 62, backgroundColor: dark ? "rgba(10,14,26,0.95)" : "rgba(240,242,248,0.97)" }}>
      {/* Logo */}
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "var(--text-main)" }}>
        <div style={{ width: 36, height: 36, background: "var(--accent)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontSize: "1.1rem", boxShadow: "0 0 12px rgba(59,123,245,0.4)" }}>R</div>
        <div>
          <div className="logo-shimmer" style={{ fontSize: "1.1rem", fontWeight: 800 }}>رسامپ</div>
          <div style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>Rasamap.ir</div>
        </div>
      </Link>

      {/* Nav tabs */}
      <nav style={{ display: "flex", gap: 4 }}>
        {tabs.map(t => (
          <Link key={t.id} href={t.href} style={{
            fontFamily: "inherit", cursor: "pointer",
            background: activeTab === t.id ? "var(--bg-surface)" : "none",
            color: activeTab === t.id ? "var(--accent)" : "var(--text-muted)",
            fontSize: "0.83rem", fontWeight: activeTab === t.id ? 600 : 400,
            padding: "7px 14px", borderRadius: 8,
            display: "flex", alignItems: "center", gap: 6,
            textDecoration: "none", border: "none",
          }}>
            <t.Icon size={14} />
            {t.label}
          </Link>
        ))}
      </nav>

      {/* Right actions */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {btn({
          background: "var(--bg-surface)", border: "1px solid var(--border)",
          color: "var(--text-main)", padding: "7px 10px", borderRadius: 8,
          display: "flex", alignItems: "center",
        }, toggle, dark ? <Sun size={16} /> : <Moon size={16} />)}

        <Link href="/list-media" style={{ border: "1px solid var(--border)", background: "none", color: "var(--text-main)", fontSize: "0.8rem", padding: "7px 14px", borderRadius: 8, textDecoration: "none" }}>ثبت رسانه</Link>

        {user ? (
          <>
            <Link href="/dashboard" style={{
              fontSize: "0.8rem", fontWeight: 600, padding: "7px 14px", borderRadius: 8,
              textDecoration: "none", color: "var(--accent)",
              border: "1px solid rgba(59,123,245,0.25)", background: "rgba(59,123,245,0.07)",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <User size={14} />
              {user.name.split(" ")[0]}
            </Link>
            {btn({
              border: "1px solid var(--border)", background: "none",
              color: "var(--text-muted)", fontSize: "0.78rem", padding: "6px 12px", borderRadius: 8,
              display: "flex", alignItems: "center", gap: 5,
            }, logout, <><LogOut size={13} /> خروج</>)}
          </>
        ) : user === null ? (
          <Link href="/login" style={{ background: "var(--accent)", color: "#fff", fontSize: "0.8rem", fontWeight: 700, padding: "7px 16px", borderRadius: 8, textDecoration: "none", boxShadow: "0 2px 10px rgba(59,123,245,0.25)" }}>
            ورود
          </Link>
        ) : null}
      </div>
    </header>
  );
}
