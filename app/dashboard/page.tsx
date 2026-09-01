"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Megaphone, Monitor, Milestone, Train, Bus, Calendar, Clock, Settings2, CheckCircle2, Search, Menu, X as XIcon } from "lucide-react";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";

interface Reservation {
  id: number;
  billboardId: number;
  billboardSlug: string;
  billboardName: string;
  billboardCity: string;
  billboardType: string;
  billboardImage: string | null;
  price: number;
  startDate: string;
  endDate: string;
  status: string;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = { pending: "در انتظار تأیید", confirmed: "تأیید شده", cancelled: "لغو شده" };
const STATUS_COLOR: Record<string, [string, string]> = {
  pending:   ["#f59e0b", "rgba(245,158,11,0.12)"],
  confirmed: ["var(--green)", "rgba(34,197,94,0.12)"],
  cancelled: ["#ef4444", "rgba(239,68,68,0.12)"],
};
const TYPE_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  billboard: Megaphone, digital: Monitor, bridge: Milestone, station: Train, vehicle: Bus,
};

type Tab = "bookings" | "settings";
const navItems: [string, Tab, React.ComponentType<{ size?: number }>][] = [
  ["رزروهای من", "bookings", Calendar],
  ["ویرایش پروفایل", "settings", Settings2],
];

function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return <span style={{ fontSize: "0.68rem", padding: "3px 10px", borderRadius: 20, background: bg, color, fontWeight: 600, whiteSpace: "nowrap" }}>{text}</span>;
}

export default function Dashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("bookings");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; phone: string } | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  // Profile edit state
  const [editName, setEditName]               = useState("");
  const [editCurPass, setEditCurPass]         = useState("");
  const [editNewPass, setEditNewPass]         = useState("");
  const [profileSaving, setProfileSaving]     = useState(false);
  const [profileSuccess, setProfileSuccess]   = useState("");
  const [profileError, setProfileError]       = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setUser(d.user); setEditName(d.user.name); })
      .catch(() => router.push("/login?next=/dashboard"));
  }, [router]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/reservations/my")
      .then(r => r.json())
      .then(d => setReservations(d.reservations ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const handleProfileSave = async () => {
    setProfileError(""); setProfileSuccess(""); setProfileSaving(true);
    const body: Record<string, string> = {};
    if (editName.trim() && editName.trim() !== user?.name) body.name = editName.trim();
    if (editNewPass) { body.currentPassword = editCurPass; body.newPassword = editNewPass; }
    if (!Object.keys(body).length) { setProfileError("تغییری وارد نکرده‌اید"); setProfileSaving(false); return; }
    try {
      const res = await fetch("/api/auth/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setProfileError(data.error ?? "خطا در ذخیره"); return; }
      setUser(data.user);
      setEditName(data.user.name);
      setEditCurPass(""); setEditNewPass("");
      setProfileSuccess("اطلاعات با موفقیت ذخیره شد ✓");
    } catch { setProfileError("خطای شبکه"); }
    finally { setProfileSaving(false); }
  };

  const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 18 };

  const pending   = reservations.filter(r => r.status === "pending").length;
  const confirmed = reservations.filter(r => r.status === "confirmed").length;

  if (!user) return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Vazirmatn Variable, Vazirmatn, sans-serif", color: "var(--text-muted)" }}>
      در حال بررسی احراز هویت...
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)", fontFamily: "Vazirmatn Variable, Vazirmatn, sans-serif", direction: "rtl", color: "var(--text-main)" }}>
      <Topbar />

      <div style={{ display: "flex", flexWrap: "wrap", maxWidth: 1200, margin: "0 auto", padding: "86px 20px 28px", gap: 24 }}>
        {/* Sidebar */}
        <div className={`dash-sidebar${sidebarOpen ? " sidebar-open" : ""}`} style={{ width: 200, flexShrink: 0, minWidth: 0 }}>
          {/* UserAvatar */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 14px", marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: "50%", background: "rgba(59,123,245,0.15)", border: "2px solid rgba(59,123,245,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "1.1rem", color: "var(--accent)", flexShrink: 0 }}>
              {user.name.charAt(0)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "0.82rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name.split(" ")[0]}</div>
              <div style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>کاربر</div>
            </div>
          </div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 8 }}>
            {navItems.map(([label, key, Icon]) => (
              <button key={key} onClick={() => setTab(key)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "right", padding: "10px 14px", borderRadius: 8, fontSize: "0.83rem", fontWeight: tab === key ? 600 : 400, color: tab === key ? "var(--accent)" : "var(--text-muted)", background: tab === key ? "rgba(59,123,245,0.08)" : "none", border: "none", fontFamily: "inherit", cursor: "pointer", marginBottom: 2 }}>
                <Icon size={14} /> {label}
              </button>
            ))}
            <div style={{ margin: "10px 8px 4px", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <Link href="/explore" style={{ display: "block", textAlign: "right", padding: "8px 6px", fontSize: "0.78rem", color: "var(--text-muted)", textDecoration: "none" }}>← جستجوی رسانه</Link>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => setSidebarOpen(o => !o)}
              style={{ display: "none", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", cursor: "pointer", color: "var(--text-main)", alignItems: "center" }}
              className="dash-hamburger"
            >
              {sidebarOpen ? <XIcon size={18} /> : <Menu size={18} />}
            </button>
            <div>
              <div style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 2 }}>خوش آمدید، {user.name} 👋</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{user.phone}</div>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
            {[
              { Icon: Calendar, label: "کل رزروها", val: reservations.length, color: "var(--accent)" },
              { Icon: Clock, label: "در انتظار تأیید", val: pending, color: "#f59e0b" },
              { Icon: CheckCircle2, label: "تأیید شده", val: confirmed, color: "var(--green)" },
            ].map(s => (
              <div key={s.label} style={{ ...card, textAlign: "center", padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 8, color: s.color }}><s.Icon size={22} /></div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 3 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {tab === "bookings" && (
            <div style={card}>
              <div style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 16 }}>رزروهای من</div>
              {loading ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-muted)" }}>در حال بارگذاری...</div>
              ) : reservations.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 20px" }}>
                  <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--bg-surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "var(--text-muted)" }}>
                    <Search size={26} />
                  </div>
                  <div style={{ fontSize: "0.92rem", fontWeight: 600, marginBottom: 6 }}>هنوز رزروی ندارید</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.7 }}>رسانه مورد نظرتان را جستجو کنید<br />و آنلاین رزرو نمایید</div>
                  <Link href="/explore" style={{ background: "var(--accent)", color: "#fff", textDecoration: "none", padding: "11px 24px", borderRadius: 9, fontSize: "0.85rem", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 8 }}><Search size={14} /> جستجوی رسانه</Link>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {reservations.map(r => {
                    const [sc, sbg] = STATUS_COLOR[r.status] ?? ["var(--text-muted)", "transparent"];
                    const start = new Date(r.startDate).toLocaleDateString("fa-IR");
                    const end   = new Date(r.endDate).toLocaleDateString("fa-IR");
                    return (
                      <div key={r.id} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, display: "flex", alignItems: "center", gap: 0, overflow: "hidden" }}>
                        {/* Thumbnail */}
                        <div style={{ width: 64, height: 64, flexShrink: 0, background: "var(--bg-card)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", borderLeft: "1px solid var(--border)" }}>
                          {r.billboardImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.billboardImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            (() => { const Icon = TYPE_ICON[r.billboardType] ?? Megaphone; return <Icon size={20} />; })()
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, padding: "12px 14px" }}>
                          <Link href={`/billboard/${r.billboardSlug}`} style={{ fontSize: "0.85rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", color: "var(--text-main)", textDecoration: "none" }}
                            onMouseEnter={e => (e.currentTarget.style.color = "var(--accent)")}
                            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-main)")}
                          >{r.billboardName}</Link>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2 }}>{r.billboardCity} · {start} تا {end}</div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, padding: "12px 14px", flexShrink: 0 }}>
                          <Badge text={STATUS_LABEL[r.status] ?? r.status} color={sc} bg={sbg} />
                          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>#{r.id}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === "settings" && (
            <div style={card}>
              <div style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 20 }}>ویرایش پروفایل</div>
              {profileSuccess && (
                <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: "0.82rem", color: "var(--green)", marginBottom: 14 }}>{profileSuccess}</div>
              )}
              {profileError && (
                <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: "0.82rem", color: "#ef4444", marginBottom: 14 }}>{profileError}</div>
              )}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 6 }}>نام و نام خانوادگی</div>
                <input value={editName} onChange={e => setEditName(e.target.value)} style={{ width: "100%", background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.85rem", padding: "10px 14px", borderRadius: 8, outline: "none" }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 6 }}>شماره موبایل (غیرقابل تغییر)</div>
                <input value={user.phone} readOnly dir="ltr" style={{ width: "100%", background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.85rem", padding: "10px 14px", borderRadius: 8, outline: "none", textAlign: "right", opacity: 0.6 }} />
              </div>
              <div style={{ margin: "20px 0 14px", borderTop: "1px solid var(--border)", paddingTop: 18, fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)" }}>تغییر رمز عبور (اختیاری)</div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 6 }}>رمز فعلی</div>
                <input type="password" value={editCurPass} onChange={e => setEditCurPass(e.target.value)} placeholder="••••••••" style={{ width: "100%", background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.85rem", padding: "10px 14px", borderRadius: 8, outline: "none" }} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 6 }}>رمز جدید (حداقل ۶ کاراکتر)</div>
                <input type="password" value={editNewPass} onChange={e => setEditNewPass(e.target.value)} placeholder="••••••••" style={{ width: "100%", background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.85rem", padding: "10px 14px", borderRadius: 8, outline: "none" }} />
              </div>
              <button
                onClick={handleProfileSave}
                disabled={profileSaving}
                style={{ background: profileSaving ? "var(--border)" : "var(--accent)", border: "none", color: "#fff", fontFamily: "inherit", fontWeight: 700, fontSize: "0.88rem", padding: "11px 24px", borderRadius: 9, cursor: profileSaving ? "default" : "pointer" }}>
                {profileSaving ? "در حال ذخیره..." : "ذخیره تغییرات"}
              </button>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
