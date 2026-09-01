"use client";
import { useState, useEffect } from "react";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import CompareModal from "@/components/CompareModal";
import Link from "next/link";
import type { Billboard } from "@/lib/data";
import { Scale, X, ArrowLeft } from "lucide-react";

export default function ComparePage() {
  const [compareList, setCompareList] = useState<Billboard[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("rasamap_compare");
      if (saved) setCompareList(JSON.parse(saved));
    } catch {}
    setLoaded(true);
  }, []);

  const remove = (id: number) => {
    const next = compareList.filter(b => b.id !== id);
    setCompareList(next);
    try { localStorage.setItem("rasamap_compare", JSON.stringify(next)); } catch {}
  };

  if (!loaded) return null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)", fontFamily: "Vazirmatn,sans-serif", direction: "rtl", color: "var(--text-main)" }}>
      <Topbar />

      <main style={{ maxWidth: 800, margin: "0 auto", padding: "88px 20px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Scale size={22} color="var(--accent)" />
          <div style={{ fontSize: "1.5rem", fontWeight: 800 }}>مقایسه رسانه‌ها</div>
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 32 }}>
          رسانه‌های انتخابی از صفحه جستجو را اینجا کنار هم ببینید
        </div>

        {compareList.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 20px", background: "var(--bg-surface)", borderRadius: 16, border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16, opacity: 0.3 }}>
              <Scale size={48} />
            </div>
            <div style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 8 }}>هنوز رسانه‌ای انتخاب نشده</div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 24 }}>
              از صفحه جستجو روی آیکون <Scale size={13} style={{ display: "inline", verticalAlign: "middle" }} /> رسانه‌ها کلیک کنید
            </div>
            <Link href="/explore" style={{ background: "var(--accent)", color: "#fff", textDecoration: "none", padding: "11px 24px", borderRadius: 9, fontSize: "0.88rem", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 8, boxShadow: "0 4px 16px rgba(59,123,245,0.3)" }}>
              <ArrowLeft size={16} /> رفتن به جستجو
            </Link>
          </div>
        )}

        {compareList.length > 0 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16, marginBottom: 28 }}>
              {compareList.slice(0, 4).map(b => {
                const thumb = (b.allImages?.[0] ?? b.images?.[0]) ?? null;
                return (
                <div key={b.id} style={{ background: "var(--bg-surface)", border: `1px solid ${compareList.indexOf(b) < 2 ? "var(--accent)" : "var(--border)"}`, borderRadius: 12, overflow: "hidden", position: "relative" }}>
                  {thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt={b.name} style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }} />
                  )}
                  {!thumb && (
                    <div style={{ width: "100%", height: 80, background: "var(--bg-card)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "1.5rem" }}>🏙</div>
                  )}
                  <div style={{ padding: "12px 14px 14px" }}>
                    <button onClick={() => remove(b.id)} title="حذف از مقایسه" style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.55)", border: "none", borderRadius: 6, width: 24, height: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                      <X size={12} />
                    </button>
                    {compareList.indexOf(b) >= 2 && (
                      <div style={{ fontSize: "0.62rem", color: "var(--accent-warm)", marginBottom: 4, fontWeight: 600 }}>فقط ۲ رسانه اول مقایسه می‌شوند</div>
                    )}
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: 3 }}>{b.name}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: 8 }}>{b.region}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
                      <span style={{ color: "var(--accent-warm)", fontWeight: 700 }}>{b.price}M ت/ماه</span>
                      <span style={{ color: "var(--text-muted)" }}>{b.width}×{b.height}م</span>
                    </div>
                  </div>
                </div>
                );
              })}

              {compareList.length < 2 && (
                <Link href="/explore" style={{ background: "none", border: "2px dashed var(--border)", borderRadius: 12, padding: 16, textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 110, color: "var(--text-muted)", cursor: "pointer" }}>
                  <Scale size={22} style={{ opacity: 0.4 }} />
                  <span style={{ fontSize: "0.8rem" }}>رسانه دیگری انتخاب کنید</span>
                </Link>
              )}
            </div>

            <div style={{ textAlign: "center" }}>
              {compareList.length >= 2 ? (
                <button onClick={() => setShowModal(true)} style={{ background: "var(--accent)", border: "none", color: "#fff", fontFamily: "inherit", fontSize: "0.92rem", fontWeight: 700, padding: "13px 36px", borderRadius: 10, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 10, boxShadow: "0 4px 16px rgba(59,123,245,0.35)" }}>
                  <Scale size={18} /> مقایسه رسانه‌های انتخابی
                </button>
              ) : (
                <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  برای مقایسه، حداقل ۲ رسانه انتخاب کنید
                </div>
              )}

              {compareList.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <Link href="/explore" style={{ fontSize: "0.8rem", color: "var(--accent)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <ArrowLeft size={14} /> افزودن رسانه دیگر از جستجو
                  </Link>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <Footer />

      {showModal && compareList.length >= 2 && (
        <CompareModal
          items={compareList.slice(0, 2)}
          onClose={() => setShowModal(false)}
          onBook={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
