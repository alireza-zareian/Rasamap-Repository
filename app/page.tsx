"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { Billboard, BillboardType } from "@/lib/types";
import { useTheme } from "@/lib/theme";
import { useCurrentUser } from "@/lib/auth/useCurrentUser";
import SwipeMarquee from "@/components/SwipeMarquee";
import { Megaphone, Eye, Building2, CheckCircle2, Search, Scale, Phone, Monitor, Milestone, Train, Sun, Moon, User, Map, MapPin, ChevronLeft, ChevronRight } from "lucide-react";

function toFa(n: number) {
  return n.toLocaleString("fa-IR");
}

const howSteps = [
  { Icon: Search, title: "جستجو کن", desc: "شهر، منطقه، بودجه و نوع رسانه‌ات رو انتخاب کن" },
  { Icon: Scale, title: "مقایسه کن", desc: "چند رسانه رو کنار هم بذار و بر اساس بازدید و قیمت تصمیم بگیر" },
  { Icon: Phone, title: "تماس بگیر", desc: "شمارهٔ صاحب رسانه را بگیر و مستقیم توافق کن — بدون واسطه" },
];

const types: { type: BillboardType; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
  { type: "billboard", label: "بیلبورد", Icon: Megaphone },
  { type: "digital", label: "دیجیتال / LED", Icon: Monitor },
  { type: "bridge", label: "عرشه پل", Icon: Milestone },
  { type: "station", label: "ایستگاه / مترو", Icon: Train },
];

const cities = ["تهران", "اصفهان", "زنجان", "مشهد", "شیراز", "تبریز"];

interface SiteStats { total: number; cityCount: number; byType: Record<string, number>; totalDailyReach: number; }

export default function LandingPage() {
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("تهران");
  const [scrolled, setScrolled] = useState(false);
  const [billboards, setBillboards] = useState<Billboard[]>([]);
  const [galIdx, setGalIdx] = useState(0);
  const [siteStats, setSiteStats] = useState<SiteStats | null>(null);
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const { user, logout } = useCurrentUser();
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Only care whether we're past the header threshold — flips state twice
    // total, not on every scroll frame.
    const onScroll = () => setScrolled(prev => {
      const next = window.scrollY > 60;
      return next === prev ? prev : next;
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    fetch("/api/billboards?sortBy=traffic_desc&limit=12")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.items)) setBillboards(d.items); })
      .catch(() => {});
    fetch("/api/stats")
      .then(r => r.json())
      .then(d => setSiteStats(d))
      .catch(() => {});
  }, []);

  const featBoards = billboards.filter(b => b.images && b.images.length > 0);

  useEffect(() => {
    if (featBoards.length < 2) return;
    autoRef.current = setInterval(() => setGalIdx(i => (i + 1) % featBoards.length), 4000);
    return () => { if (autoRef.current) clearInterval(autoRef.current); };
  }, [featBoards.length]);

  const goGal = (dir: 1 | -1) => {
    if (autoRef.current) clearInterval(autoRef.current);
    setGalIdx(i => (i + dir + featBoards.length) % featBoards.length);
    autoRef.current = setInterval(() => setGalIdx(i => (i + 1) % featBoards.length), 4000);
  };

  const typeCounts = (t: BillboardType) => siteStats?.byType[t] ?? null;

  const headerBg = scrolled
    ? (dark ? "rgba(10,14,26,0.97)" : "rgba(240,242,248,0.97)")
    : "transparent";

  return (
    <div style={{ fontFamily: "Vazirmatn Variable, Vazirmatn, sans-serif", direction: "rtl", color: "var(--text-main)", background: "var(--bg-deep)", minHeight: "100vh" }}>

      {/* ── Fixed header — logo + auth only ── */}
      <header style={{ position: "fixed", top: 0, right: 0, left: 0, zIndex: 100, background: headerBg, backdropFilter: scrolled ? "blur(16px)" : "none", borderBottom: scrolled ? "1px solid var(--border)" : "none", transition: "all 0.35s", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", height: 64 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "var(--text-main)" }}>
          <div style={{ width: 36, height: 36, background: "var(--accent)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontSize: "1.1rem", boxShadow: "0 0 14px rgba(59,123,245,0.4)" }}>R</div>
          <span className="logo-shimmer" style={{ fontSize: "1.15rem", fontWeight: 800, letterSpacing: "-0.2px" }}>رسامپ</span>
        </Link>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={toggle} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-main)", padding: "7px 10px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s", display: "flex", alignItems: "center" }}>
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {user ? (
            <>
              <Link href="/dashboard" style={{ border: "1px solid rgba(59,123,245,0.28)", color: "var(--accent)", background: "rgba(59,123,245,0.06)", padding: "7px 14px", borderRadius: 8, textDecoration: "none", fontSize: "0.82rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <User size={14} /> {user.name.split(" ")[0]}
              </Link>
              <button onClick={logout} style={{ border: "1px solid var(--border)", background: "none", color: "var(--text-muted)", padding: "7px 12px", borderRadius: 8, fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit" }}>خروج</button>
            </>
          ) : user === null ? (
            <Link href="/login" style={{ border: "1px solid var(--border)", color: "var(--text-main)", padding: "7px 16px", borderRadius: 8, textDecoration: "none", fontSize: "0.82rem" }}>ورود</Link>
          ) : null}
          <Link href="/explore" className="btn-sheen" style={{ background: "var(--accent)", color: "#fff", padding: "7px 18px", borderRadius: 8, textDecoration: "none", fontSize: "0.82rem", fontWeight: 700, boxShadow: "0 2px 12px rgba(59,123,245,0.35)" }}>شروع رایگان</Link>
        </div>
      </header>

      {/* ── Hero — compact ── */}
      <section style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden", paddingTop: 64 }}>
        {/* Static background — no scroll-linked transform */}
        <div style={{ position: "absolute", inset: 0 }}>
          <div style={{ position: "absolute", inset: 0, background: dark ? "linear-gradient(135deg, #0A0E1A 0%, #0f1829 50%, #0A0E1A 100%)" : "linear-gradient(135deg, #E8EBF4 0%, #F0F2F8 50%, #E8EBF4 100%)" }} />
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.18 }} viewBox="0 0 1400 900" preserveAspectRatio="xMidYMid slice">
            {Array.from({ length: 12 }, (_, i) => <line key={`h${i}`} x1="0" y1={i * 80} x2="1400" y2={i * 80} stroke="#3B7BF5" strokeWidth="0.5" />)}
            {Array.from({ length: 18 }, (_, i) => <line key={`v${i}`} x1={i * 80} y1="0" x2={i * 80} y2="900" stroke="#3B7BF5" strokeWidth="0.5" />)}
            {[[120, 200], [400, 100], [700, 250], [950, 150], [1200, 200], [250, 500], [600, 480], [850, 520], [1100, 460]].map(([x, y], i) => (
              <g key={i}>
                <rect x={x} y={y} width="80" height="50" rx="4" fill="none" stroke="#3B7BF5" strokeWidth="1" opacity="0.6" />
                <rect x={x + 5} y={y + 5} width="70" height="40" rx="2" fill="#3B7BF5" opacity="0.08" />
                <line x1={x + 40} y1={y + 50} x2={x + 40} y2={y + 90} stroke="#3B7BF5" strokeWidth="2" opacity="0.4" />
              </g>
            ))}
          </svg>
        </div>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 60%, rgba(59,123,245,0.1) 0%, transparent 60%), radial-gradient(ellipse at 20% 40%, rgba(0,209,122,0.06) 0%, transparent 50%)" }} />

        {/* Centered content — compact */}
        <div style={{ position: "relative", width: "100%", maxWidth: 900, margin: "0 auto", padding: "28px 28px 20px", textAlign: "center" }}>

          {/* Single colorful headline line */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: "10px 16px", marginBottom: 18 }}>
            <span className="shimmer-heading" style={{ fontSize: "clamp(1.15rem, 2.8vw, 1.65rem)", fontWeight: 900, letterSpacing: "-0.3px", whiteSpace: "nowrap" }}>رسانه‌ات رو پیدا کن</span>
            <span style={{ color: "var(--border)", fontSize: "1.1rem", fontWeight: 300 }}>—</span>
            {/* Each chip names a media type the catalogue can filter by, so it
                links straight to that filter. Same look as before — a link with
                the span's own styling, not a restyled button. */}
            {([
              { label: "بیلبورد",        type: "billboard", color: "#3B7BF5" },
              { label: "تلویزیون شهری",  type: "digital",   color: "#00D17A" },
              { label: "عرشه پل",        type: "bridge",    color: "#F5823B" },
              { label: "ایستگاه مترو",   type: "station",   color: "#a855f7" },
            ] as const).map(item => (
              <Link key={item.label} href={`/explore?type=${item.type}`} title={`دیدن همهٔ ${item.label}‌ها`} style={{ fontSize: "clamp(0.75rem, 1.7vw, 1rem)", fontWeight: 700, color: item.color, padding: "4px 12px", borderRadius: 20, background: `${item.color}14`, border: `1px solid ${item.color}32`, whiteSpace: "nowrap", textDecoration: "none" }}>{item.label}</Link>
            ))}
            <span style={{ fontSize: "clamp(0.7rem, 1.4vw, 0.88rem)", fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap" }}>— آنلاین، بدون واسطه</span>
          </div>

          {/* Compact search bar */}
          <div className="gradient-frame" style={{ background: dark ? "rgba(17,24,39,0.92)" : "rgba(255,255,255,0.95)", border: "1px solid var(--border)", borderRadius: 12, padding: "8px 10px", display: "flex", gap: 6, alignItems: "center", marginBottom: 10, backdropFilter: "blur(16px)", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
            <select value={city} onChange={e => setCity(e.target.value)} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.82rem", padding: "7px 10px", borderRadius: 7, outline: "none", flexShrink: 0 }}>
              {cities.map(c => <option key={c}>{c}</option>)}
            </select>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="منطقه، خیابان، نوع رسانه..."
              onKeyDown={e => e.key === "Enter" && (window.location.href = `/explore?search=${encodeURIComponent(search)}&city=${encodeURIComponent(city)}`)}
              style={{ flex: 1, background: "none", border: "none", color: "var(--text-main)", fontFamily: "inherit", fontSize: "0.85rem", outline: "none", minWidth: 0 }}
            />
            <Link href={`/explore?search=${encodeURIComponent(search)}&city=${encodeURIComponent(city)}`} className="btn-sheen" style={{ background: "var(--accent)", color: "#fff", border: "none", fontFamily: "inherit", fontSize: "0.82rem", fontWeight: 700, padding: "9px 16px", borderRadius: 8, cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0, boxShadow: "0 2px 10px rgba(59,123,245,0.4)", display: "flex", alignItems: "center", gap: 5 }}>
              <Search size={14} /> جستجو
            </Link>
          </div>

          {/* Quick chips — compact */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 16 }}>
            {["همت غرب", "ونک", "ولیعصر", "آزادی", "تجریش", "صادقیه"].map(q => (
              <Link key={q} href={`/explore?search=${q}`} style={{ fontSize: "0.7rem", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 20, padding: "3px 11px", textDecoration: "none" }}>{q}</Link>
            ))}
          </div>

          {/* Live ticker */}
          {billboards.length > 0 && (
            <div style={{ overflow: "hidden", background: dark ? "rgba(10,14,26,0.55)" : "rgba(255,255,255,0.6)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 12px", backdropFilter: "blur(8px)", display: "inline-flex", alignItems: "center", gap: 8, maxWidth: 500, width: "100%" }}>
              <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "var(--green-accent)", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--green-accent)", display: "inline-block", boxShadow: "0 0 5px var(--green-accent)" }} /> زنده
              </span>
              <SwipeMarquee className="ticker-window" style={{ flex: 1 }}>
                <div className="ticker-strip" style={{ display: "flex", gap: 22, animation: "tickerScroll 22s linear infinite", whiteSpace: "nowrap" }}>
                  {[...billboards, ...billboards].map((b, i) => (
                    <a key={i} href={`/billboard/${b.slug}`} style={{ fontSize: "0.67rem", color: "var(--text-muted)", textDecoration: "none", flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ color: "var(--accent-warm)", fontWeight: 700 }}>{b.price}M</span>
                      {b.name.substring(0, 22)}
                      <span style={{ color: "var(--border)" }}>·</span>
                    </a>
                  ))}
                </div>
              </SwipeMarquee>
            </div>
          )}
        </div>
      </section>

      {/* ── Featured billboard gallery ── */}
      <section style={{ padding: "24px 0 56px", overflow: "hidden", background: "var(--bg-deep)" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28 }}>
            <div>
              <div style={{ fontSize: "0.72rem", color: "var(--accent)", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>پربازدیدترین</div>
              <h2 style={{ fontSize: "1.7rem", fontWeight: 800, margin: 0 }}>رسانه‌های برتر</h2>
            </div>
            <Link href="/explore" style={{ fontSize: "0.82rem", color: "var(--accent)", textDecoration: "none", border: "1px solid rgba(59,123,245,0.28)", padding: "7px 16px", borderRadius: 8, whiteSpace: "nowrap" }}>مشاهده همه ←</Link>
          </div>

          {featBoards.length > 0 ? (
            <div style={{ position: "relative" }}>
              {/* Sliding strip — multiple cards, square images */}
              <div style={{ overflow: "hidden", borderRadius: 16 }}>
                <div style={{ display: "flex", gap: 16, transform: `translateX(calc(${galIdx} * (280px + 16px)))`, transition: "transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)" }}>
                  {[...featBoards, ...featBoards.slice(0, 4)].map((b, i) => (
                    <Link
                      key={i}
                      href={`/billboard/${b.slug}`}
                      style={{ flexShrink: 0, width: 280, borderRadius: 16, overflow: "hidden", display: "block", textDecoration: "none", position: "relative", aspectRatio: "1/1", background: "var(--bg-card)", boxShadow: "0 8px 32px rgba(0,0,0,0.22)", border: "1px solid var(--border)" }}
                    >
                      {/* No loading="lazy" here on purpose. These cards live in a
                          strip that is moved by translateX inside overflow:hidden,
                          so every card past the first is outside the viewport and a
                          lazy image would not be fetched — and on a phone, where the
                          lazy pre-load distance is much smaller than on desktop, that
                          left the carousel showing empty cards as it advanced. The
                          strip is at most 12 photos and auto-advances every 4s, so
                          all of them are needed inside a minute anyway. decoding
                          stays async: it costs nothing and keeps decode off the main
                          thread. Vertically scrolling lists keep their lazy loading. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={b.images[0]} alt={b.name} decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(5,10,22,0.9) 0%, rgba(5,10,22,0.25) 50%, transparent 100%)" }} />
                      <div style={{ position: "absolute", bottom: 0, right: 0, left: 0, padding: "16px 14px 18px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 5 }}>
                          <MapPin size={10} color="var(--green-accent)" />
                          <span style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.65)" }}>{b.city}</span>
                        </div>
                        <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#fff", lineHeight: 1.3, marginBottom: 8, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{b.name}</div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--accent-warm)" }}>{b.price}M</span>
                          <span style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.5)" }}>تومان/ماه</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Prev / Next */}
              <button onClick={() => goGal(-1)} style={{ position: "absolute", top: "50%", right: -16, transform: "translateY(-50%)", width: 44, height: 44, borderRadius: "50%", background: dark ? "rgba(10,14,26,0.9)" : "rgba(255,255,255,0.95)", border: "1px solid var(--border)", color: "var(--text-main)", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(0,0,0,0.2)", zIndex: 10 }}><ChevronRight size={22} /></button>
              <button onClick={() => goGal(1)} style={{ position: "absolute", top: "50%", left: -16, transform: "translateY(-50%)", width: 44, height: 44, borderRadius: "50%", background: dark ? "rgba(10,14,26,0.9)" : "rgba(255,255,255,0.95)", border: "1px solid var(--border)", color: "var(--text-main)", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(0,0,0,0.2)", zIndex: 10 }}><ChevronLeft size={22} /></button>

              {/* Dot indicators */}
              <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 20 }}>
                {featBoards.map((_, i) => (
                  <button key={i} onClick={() => setGalIdx(i)} style={{ width: i === galIdx ? 20 : 6, height: 6, borderRadius: 3, background: i === galIdx ? "var(--accent)" : "var(--border)", border: "none", cursor: "pointer", padding: 0, transition: "all 0.3s ease" }} />
                ))}
              </div>
            </div>
          ) : (
            /* Loading skeletons */
            <div style={{ display: "flex", gap: 16 }}>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{ flexShrink: 0, width: 280, aspectRatio: "3/4", borderRadius: 16, background: "var(--bg-card)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ textAlign: "center", color: "var(--text-muted)", opacity: 0.4, display: "flex" }}>
                    <Building2 size={40} strokeWidth={1.4} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section style={{ padding: "56px 28px", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "var(--bg-card)" }}>
        <div className="stats-bar-grid" style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, textAlign: "center" }}>
          {[
            { num: siteStats ? toFa(siteStats.total) + "+" : "۳۵۰۰+", label: "رسانه ثبت‌شده", Icon: Megaphone, color: "var(--accent)" },
            { num: siteStats ? toFa(Math.round(siteStats.totalDailyReach / 1_000_000)) + "M+" : "۵۰۰M+", label: "تردد روزانه بازار", Icon: Eye, color: "var(--green-accent)" },
            { num: siteStats ? toFa(siteStats.cityCount) : "۸۷", label: "شهر پوشش‌داده", Icon: Building2, color: "var(--accent-warm)" },
            { num: "۱۰۰٪", label: "آنلاین و بدون تماس", Icon: CheckCircle2, color: "var(--green-accent)" },
          ].map(s => (
            <div key={s.label} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: `${s.color}12`, border: `1px solid ${s.color}28`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10, color: s.color }}>
                <s.Icon size={22} />
              </div>
              <div style={{ fontSize: "2rem", fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.num}</div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 6 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Media types ── */}
      <section id="types" style={{ padding: "80px 28px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div className="section-halo" style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontSize: "0.75rem", color: "var(--accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>انواع رسانه</div>
            <h2 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: 12 }}>هر نوع رسانه‌ای که نیاز داری</h2>
          </div>
          <div className="types-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
            {types.map(t => (
              <Link key={t.type} href={`/explore?type=${t.type}`} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "24px", textDecoration: "none", color: "var(--text-main)", display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 56, height: 56, background: "rgba(59,123,245,0.08)", border: "1px solid rgba(59,123,245,0.2)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", flexShrink: 0 }}><t.Icon size={26} /></div>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{t.label}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{typeCounts(t.type) != null ? toFa(typeCounts(t.type)!) + " رسانه موجود" : "..."}</div>
                </div>
                <div style={{ marginRight: "auto", fontSize: "0.8rem", color: "var(--accent)", fontWeight: 600 }}>مشاهده ←</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" style={{ padding: "80px 28px", background: "var(--bg-card)", borderTop: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div className="section-halo" style={{ textAlign: "center", marginBottom: 52 }}>
            <div style={{ fontSize: "0.75rem", color: "var(--accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>چطور کار میکنه؟</div>
            <h2 style={{ fontSize: "2rem", fontWeight: 800 }}>سه قدم تا اکران تبلیغ</h2>
          </div>
          <div className="how-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {howSteps.map((s, i) => (
              <div key={s.title} style={{ textAlign: "center", padding: "24px 16px" }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--bg-surface)", border: "2px solid var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", margin: "0 auto 16px", position: "relative" }}>
                  <s.Icon size={26} />
                  <div style={{ position: "absolute", top: -8, right: -8, width: 22, height: 22, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, color: "#fff" }}>{i + 1}</div>
                </div>
                <div style={{ fontWeight: 700, marginBottom: 8, fontSize: "1rem" }}>{s.title}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.7 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section style={{ padding: "80px 28px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div className="section-halo" style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontSize: "0.75rem", color: "var(--accent)", fontWeight: 700, letterSpacing: 2, marginBottom: 12 }}>تجربه مشتریان</div>
            <h2 style={{ fontSize: "2rem", fontWeight: 800 }}>آن‌ها از رسامپ استفاده کردند</h2>
          </div>
          <div className="testimonials-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {[
              { name: "علی رضایی", company: "آژانس تبلیغاتی آرتا", color: "#3B7BF5", letter: "ع", text: "با رسامپ توانستم در کمتر از ۱۰ دقیقه بیلبوردهای خیابان ولیعصر رو مقایسه کنم و بهترین قیمت رو پیدا کنم. دیگه نیازی به تماس تلفنی نیست." },
              { name: "مریم کریمی", company: "برند پوشاک کاج", color: "#00D17A", letter: "م", text: "رسامپ کارمون رو خیلی آسون کرد. موقعیت دقیق هر بیلبورد رو می‌بینیم و تراکم رقبا رو بررسی می‌کنیم قبل از تماس." },
              { name: "حسین موسوی", company: "شرکت داروسازی پارسیان", color: "#9B72F5", letter: "ح", text: "قیمت‌گذاری شفاف رسامپ باورنکردنیه. می‌دونیم دقیقاً چقدر باید بپردازیم — بدون مذاکره، بدون سورپرایز." },
            ].map(t => (
              <div key={t.name} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
                <div style={{ fontSize: "1.8rem", color: `${t.color}60`, marginBottom: 14, lineHeight: 1 }}>&ldquo;</div>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.9, marginBottom: 20, fontWeight: 300 }}>{t.text}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: `${t.color}20`, border: `2px solid ${t.color}50`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "1rem", color: t.color, flexShrink: 0 }}>{t.letter}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>{t.name}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{t.company}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trusted brands bar ── */}
      <section style={{ padding: "36px 28px", borderTop: "1px solid var(--border)", background: "var(--bg-card)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 20, letterSpacing: 1 }}>همراه برندهایی مثل</div>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 40, flexWrap: "wrap" }}>
            {["دیجی‌کالا", "اسنپ‌فود", "آپارات", "همراه اول", "ایرانسل"].map(brand => (
              <span key={brand} style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--text-muted)", opacity: 0.55, letterSpacing: "-0.3px" }}>{brand}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="section-halo" style={{ padding: "100px 28px", textAlign: "center" }}>
        <h2 style={{ fontSize: "2.2rem", fontWeight: 900, marginBottom: 16 }}>آماده‌ای شروع کنی؟</h2>
        <p style={{ color: "var(--text-muted)", marginBottom: 36, fontSize: "0.95rem" }}>بیش از {siteStats ? toFa(siteStats.total) : "۳۵۰۰"} رسانه منتظرته — رایگان شروع کن</p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/explore" className="btn-sheen" style={{ background: "var(--accent)", color: "#fff", padding: "14px 36px", borderRadius: 10, textDecoration: "none", fontWeight: 700, fontSize: "1rem", boxShadow: "0 4px 24px rgba(59,123,245,0.4)", display: "inline-flex", alignItems: "center", gap: 8 }}><Map size={18} /> ورود به پلتفرم</Link>
          <Link href="/list-media" style={{ border: "1px solid var(--border)", color: "var(--text-main)", padding: "14px 36px", borderRadius: 10, textDecoration: "none", fontSize: "0.95rem" }}>ثبت رسانه شما</Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: "1px solid var(--border)", padding: "40px 28px", background: "var(--bg-card)" }}>
        <div className="footer-grid" style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 40 }}>
          <div>
            <div style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: 12 }}>رسا<span style={{ color: "var(--accent)" }}>مپ</span></div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.8 }}>پلتفرم دیجیتال جستجو و مقایسهٔ رسانه‌های تبلیغاتی محیطی ایران</div>
          </div>
          {[
            { title: "پلتفرم", links: [["جستجو رسانه", "/explore"], ["مقایسه", "/compare"]] },
            { title: "کاربران", links: [["ورود / ثبت‌نام", "/login"], ["داشبورد", "/dashboard"], ["ثبت رسانه", "/list-media"]] },
            { title: "شرکت", links: [["درباره ما", "/about"], ["تماس", "/contact"], ["قوانین", "/terms"]] },
          ].map(col => (
            <div key={col.title}>
              <div style={{ fontWeight: 700, marginBottom: 14, fontSize: "0.85rem" }}>{col.title}</div>
              {col.links.map(([l, h]) => (
                <div key={l} style={{ marginBottom: 8 }}>
                  <Link href={h} style={{ fontSize: "0.78rem", color: "var(--text-muted)", textDecoration: "none" }}>{l}</Link>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ maxWidth: 1100, margin: "28px auto 0", paddingTop: 20, borderTop: "1px solid var(--border)", textAlign: "center", fontSize: "0.72rem", color: "var(--text-muted)" }}>
          © ۱۴۰۵ رسامپ — Rasamap.ir
        </div>
      </footer>
    </div>
  );
}
