import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Ruler, Square, Layers, MapPin } from "lucide-react";
import { getBillboardBySlug } from "@/lib/db/billboards";
import BillboardGallery from "@/components/BillboardGallery";
import ShareButton from "@/components/ShareButton";
import ReviewsSection from "@/components/ReviewsSection";
import TrafficMeter from "@/components/TrafficMeter";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import BillboardBookingCTA from "@/components/BillboardBookingCTA";

const TYPE_LABEL: Record<string, string> = {
  billboard: "بیلبورد", digital: "دیجیتال", bridge: "پل عابر", station: "ایستگاه", vehicle: "وسیله نقلیه",
};
const STATUS_LABEL: Record<string, string> = {
  available: "آزاد", busy: "اشغال", reserved: "رزرو شده", inactive: "غیرفعال",
};
const STATUS_COLOR: Record<string, string> = {
  available: "#22c55e", busy: "#ef4444", reserved: "#f59e0b", inactive: "#6b7280",
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const b = await getBillboardBySlug(slug);
  if (!b) return { title: "رسانه یافت نشد | رسامپ" };
  return {
    title: `${b.name} | رسامپ`,
    description: `${TYPE_LABEL[b.type] ?? b.type} در ${b.city} — ${b.width}×${b.height} متر — ${b.price.toLocaleString()} میلیون تومان/ماه`,
    openGraph: {
      title: b.name,
      description: `${b.city} · ${TYPE_LABEL[b.type]} · ${b.price.toLocaleString()} میلیون تومان`,
      ...(b.images?.[0] ? { images: [{ url: b.images[0] }] } : {}),
    },
  };
}

export default async function BillboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await getBillboardBySlug(slug);
  if (!b) notFound();

  const allImgs: string[] = [
    ...(b.images ?? []),
    ...((b.allImages ?? []).filter(u => !(b.images ?? []).includes(u))),
  ];
  const statusColor = STATUS_COLOR[b.status] ?? "#6b7280";
  const area = b.width * b.height;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)", fontFamily: "Vazirmatn Variable, Vazirmatn, sans-serif", direction: "rtl", color: "var(--text-main)" }}>
      <Topbar />

      {/* Breadcrumb */}
      <div style={{ maxWidth: 1350, margin: "0 auto", padding: "80px 20px 0", display: "flex", alignItems: "center", gap: 8, fontSize: "0.78rem", color: "var(--text-muted)" }}>
        <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none" }}>خانه</Link>
        <span>›</span>
        <Link href="/explore" style={{ color: "var(--text-muted)", textDecoration: "none" }}>جستجو</Link>
        <span>›</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>{b.name}</span>
      </div>

      <div style={{ maxWidth: 1350, margin: "0 auto", padding: "16px 20px 40px" }}>
        <div className="detail-grid" style={{ display: "grid", gridTemplateColumns: "1fr 440px", gap: 24, alignItems: "start" }}>

          {/* Left column */}
          <div className="detail-main">
           {/* Head block — on mobile this stays first, above the booking card */}
           <div className="detail-head">
            {/* Title row: name right (first in DOM = right in RTL), badges left (second = left) */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
              <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, lineHeight: 1.3, textAlign: "right" }}>{b.name}</h1>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
                <span style={{ fontSize: "0.68rem", padding: "2px 9px", borderRadius: 20, background: "rgba(255,77,0,0.1)", color: "var(--accent)", fontWeight: 600, whiteSpace: "nowrap" }}>{TYPE_LABEL[b.type] ?? b.type}</span>
                <span style={{ fontSize: "0.68rem", padding: "2px 9px", borderRadius: 20, background: `${statusColor}18`, color: statusColor, fontWeight: 600, whiteSpace: "nowrap" }}>{STATUS_LABEL[b.status] ?? b.status}</span>
                <ShareButton title={b.name} />
              </div>
            </div>
            <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginBottom: 10, textAlign: "right" }}>{b.location}</div>

            {/* Image — full width, right up under the title */}
            <BillboardGallery images={allImgs} name={b.name} icon={b.icon} />

            {/* Specs chips — below image, Lucide icons */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {[
                { icon: <Ruler size={13} />, label: "ابعاد", val: `${b.width}×${b.height} m` },
                { icon: <Square size={13} />, label: "مساحت", val: `${area} m²` },
                { icon: <Layers size={13} />, label: "وجه", val: `${b.faces} وجه` },
                { icon: <MapPin size={13} />, label: "شهر", val: b.city },
              ].map(s => (
                <div key={s.label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 12px", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "var(--text-muted)", display: "flex" }}>{s.icon}</span>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700 }}>{s.val}</span>
                  <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>{s.label}</span>
                </div>
              ))}
            </div>

           </div>{/* end detail-head */}

           {/* Body block — on mobile this drops below the booking card */}
           <div className="detail-body">
            {/* Traffic */}
            {b.traffic && (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>آنالیز ترافیک</span>
                  <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)", color: "#f59e0b", letterSpacing: "0.02em" }}>تخمین هوشمند</span>
                </div>
                <div className="detail-traffic" style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
                  {/* TrafficMeter — 60% width (RTL: right side) */}
                  <div className="detail-traffic-meter" style={{ flex: "0 0 60%", minWidth: 0 }}>
                    <TrafficMeter traffic={b.traffic} />
                  </div>
                  {/* 6 stat chips — remaining space (RTL: left side) */}
                  <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                    {[
                      { label: "تردد روزانه", val: b.traffic.daily ? `${(b.traffic.daily / 1000).toFixed(0)}K` : "—" },
                      { label: "بینندگان تخمینی", val: b.traffic.estimatedViews ? `${(b.traffic.estimatedViews / 1000).toFixed(0)}K` : "—" },
                      { label: "امتیاز دیده شدن", val: b.traffic.viewabilityScore ? `${b.traffic.viewabilityScore}/100` : "—" },
                      { label: "اوج ترافیک", val: b.traffic.peakHour || "—" },
                      { label: "سطح تراکم", val: b.traffic.congestionLevel ? `${b.traffic.congestionLevel}/10` : "—" },
                      { label: "عابران پیاده", val: b.traffic.pedestrian ? `${(b.traffic.pedestrian / 1000).toFixed(0)}K` : "—" },
                    ].map(item => (
                      <div key={item.label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 8px", textAlign: "center" }}>
                        <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--accent)" }}>{item.val}</div>
                        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 4 }}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 8, lineHeight: 1.6 }}>
                  * اعداد ترافیک بر اساس جمعیت شهر، نوع رسانه، و موقعیت مکانی تخمین زده شده‌اند — داده واقعی ممکن است متفاوت باشد.
                </div>
              </div>
            )}

            {/* Description */}
            {b.description && (
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, marginTop: 16 }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: 10 }}>توضیحات</div>
                <p style={{ margin: 0, fontSize: "0.83rem", color: "var(--text-muted)", lineHeight: 1.8 }}>{b.description}</p>
              </div>
            )}

            {/* Features */}
            {b.features?.length > 0 && (
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, marginTop: 16 }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: 12 }}>ویژگی‌ها</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {b.features.map((f, i) => (
                    <span key={i} style={{ background: "rgba(255,77,0,0.07)", color: "var(--accent)", border: "1px solid rgba(255,77,0,0.2)", padding: "4px 12px", borderRadius: 20, fontSize: "0.75rem" }}>✓ {f}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Nearby landmarks */}
            {b.nearbyLandmarks?.length > 0 && (
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, marginTop: 16 }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: 12 }}>مکان‌های اطراف</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {b.nearbyLandmarks.map((lm, i) => (
                    <span key={i} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", padding: "4px 12px", borderRadius: 20, fontSize: "0.75rem", color: "var(--text-muted)" }}>📍 {lm}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Reviews */}
            <ReviewsSection billboardId={b.id} />
           </div>{/* end detail-body */}
          </div>

          {/* Right sidebar */}
          <div className="detail-side">
            {/* Sticky pricing card — compact so map fits below on first load */}
            <div className="detail-sticky" style={{ position: "sticky", top: 24 }}>
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, padding: "18px 20px" }}>
                {/* Price + label on one line */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--accent)", lineHeight: 1 }}>{b.price.toLocaleString()}</span>
                  <span style={{ fontSize: "0.73rem", color: "var(--text-muted)" }}>میلیون تومان / ماه</span>
                  <span style={{ fontSize: "0.6rem", fontWeight: 600, padding: "1px 6px", borderRadius: 20, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", color: "#f59e0b", whiteSpace: "nowrap" }}>حدسی · متغیر</span>
                </div>

                {/* Sub-prices row */}
                <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                  {[
                    { label: "هفتگی", val: b.priceWeekly },
                    { label: "سه‌ماهه", val: b.priceQuarterly },
                    { label: "سالانه", val: b.priceYearly },
                  ].map(p => (
                    <div key={p.label} style={{ flex: 1, background: "var(--bg-surface)", borderRadius: 8, padding: "7px 4px", textAlign: "center" }}>
                      <div style={{ fontSize: "0.8rem", fontWeight: 700 }}>{p.val?.toLocaleString() ?? "—"}</div>
                      <div style={{ fontSize: "0.58rem", color: "var(--text-muted)", marginTop: 1 }}>{p.label}</div>
                    </div>
                  ))}
                </div>

                <BillboardBookingCTA billboard={b} />

                <Link href="/explore" style={{ display: "block", textAlign: "center", textDecoration: "none", color: "var(--text-muted)", fontSize: "0.78rem", padding: "6px" }}>
                  ← بازگشت به جستجو
                </Link>

                {/* Contact info */}
                {(b.phone && b.phone !== "—" && b.phone.trim()) ? (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: 6 }}>
                      تماس با {b.agency && b.agency !== "اجاره‌دهنده مستقیم" ? b.agency : "آگهی‌دهنده"}
                    </div>
                    <a href={`tel:${b.phone}`} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(34,197,94,0.08)", border: "1.5px solid rgba(34,197,94,0.3)", borderRadius: 10, padding: "9px 12px", textDecoration: "none", color: "#22c55e", fontWeight: 700, fontSize: "0.95rem", direction: "ltr", letterSpacing: "0.03em" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.59A16 16 0 0 0 15.41 16l1.42-1.42a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      {b.phone}
                    </a>
                  </div>
                ) : b.agency ? (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>آژانس: <span style={{ color: "var(--text-main)" }}>{b.agency}</span></div>
                  </div>
                ) : null}
              </div>

              {/* Source badge */}
              {b.source && b.source !== "manual" && (
                <div style={{ marginTop: 8, textAlign: "center", fontSize: "0.63rem", color: "var(--text-muted)" }}>
                  منبع: {b.source} {b.scrapedAt ? `· ${new Date(b.scrapedAt).toLocaleDateString("fa-IR")}` : ""}
                </div>
              )}
            </div>{/* end sticky */}

            {/* Map — below sticky card, visible on first load without scrolling */}
            {b.lat && b.lng && (
              <div style={{ marginTop: 12, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
                <div style={{ padding: "8px 14px", fontSize: "0.75rem", fontWeight: 700, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>موقعیت</span>
                  <a href={`https://www.google.com/maps?q=${b.lat},${b.lng}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.68rem", color: "var(--accent)", textDecoration: "none" }}>Google Maps ↗</a>
                </div>
                <iframe
                  src={`https://maps.google.com/maps?q=${b.lat},${b.lng}&z=15&output=embed&hl=fa`}
                  width="100%"
                  height="260"
                  style={{ display: "block", border: "none" }}
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  title="موقعیت بیلبورد"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
