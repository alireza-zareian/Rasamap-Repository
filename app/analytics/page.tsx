"use client";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import AnalyticsTab from "@/components/AnalyticsTab";
import { BarChart2 } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)", fontFamily: "Vazirmatn Variable, Vazirmatn, sans-serif", direction: "rtl", color: "var(--text-main)" }}>
      <Topbar />

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "88px 20px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <BarChart2 size={22} color="var(--accent)" />
          <div style={{ fontSize: "1.5rem", fontWeight: 800 }}>تحلیل بازار</div>
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 28 }}>
          نمای کلی از وضعیت رسانه‌های تبلیغاتی فضای باز در ایران
        </div>

        <AnalyticsTab />
      </main>

      <Footer />
    </div>
  );
}
