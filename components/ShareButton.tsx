"use client";
import { useState } from "react";

export default function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title, url }); return; } catch {}
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={share}
      title="اشتراک‌گذاری لینک"
      style={{ fontSize: "0.72rem", padding: "4px 12px", borderRadius: 20, background: copied ? "rgba(34,197,94,0.12)" : "var(--bg-surface)", color: copied ? "var(--green)" : "var(--text-muted)", border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s" }}
    >
      {copied ? "✓ کپی شد" : "🔗 اشتراک‌گذاری"}
    </button>
  );
}
