"use client";
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { SectionCard } from "@/components/admin/Badge";

/**
 * A failure inside one section. The menu and the top bar belong to the layout
 * above this boundary, so they stay: the admin can retry, or move to another
 * section, without the whole panel turning into an error page.
 */
export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <SectionCard>
      <div style={{ textAlign: "center", padding: "32px 0" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, color: "var(--accent-warm)" }}><TriangleAlert size={40} strokeWidth={1.5} /></div>
        <div style={{ fontSize: "1rem", fontWeight: 800, marginBottom: 6 }}>این بخش بارگذاری نشد</div>
        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: error.digest ? 8 : 20 }}>
          بقیهٔ پنل در دسترس است. دوباره امتحان کنید یا بخش دیگری را باز کنید.
        </div>
        {error.digest && (
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 20, fontFamily: "monospace", direction: "ltr" }}>
            کد خطا: {error.digest}
          </div>
        )}
        <button onClick={reset} style={{ background: "var(--accent)", border: "none", color: "#fff", fontFamily: "inherit", fontSize: "0.85rem", fontWeight: 700, padding: "9px 22px", borderRadius: 9, cursor: "pointer" }}>
          تلاش مجدد
        </button>
      </div>
    </SectionCard>
  );
}
