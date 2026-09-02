"use client";
import { useState } from "react";
import { C } from "./constants";
import { Badge } from "./Badge";
import { Bot, Map, Globe, Wrench } from "lucide-react";

const SCRAPER_SOURCES = [
  { key: "billboardiha", label: "Billboardiha.com", Icon: Map },
  { key: "geocoding",    label: "Geocoding فقط",   Icon: Globe },
  { key: "cache_repair", label: "ترمیم کش",        Icon: Wrench },
];

type RunStatus = "idle" | "running" | "done" | "error";
interface RunState { status: RunStatus; log: string[]; count?: number; }

export function ScraperPanel({ canRun }: { canRun: boolean }) {
  const [runs, setRuns] = useState<Record<string, RunState>>({});

  const startRun = (key: string) => {
    if (!canRun) { alert("دسترسی ندارید"); return; }
    setRuns(r => ({ ...r, [key]: { status: "running", log: [`[${new Date().toLocaleTimeString("fa-IR")}] شروع ${key}...`] } }));
    const msgs = ["اتصال...", "صفحه ۱ — ۱۸", "صفحه ۲ — ۱۵", "جئوکدینگ...", "۴۵ آیتم پردازش شد"];
    let i = 0;
    const iv = setInterval(() => {
      if (i < msgs.length) {
        setRuns(r => ({ ...r, [key]: { ...r[key], log: [...(r[key]?.log ?? []), `[${new Date().toLocaleTimeString("fa-IR")}] ${msgs[i]}`] } }));
        i++;
      } else {
        clearInterval(iv);
        setRuns(r => ({ ...r, [key]: { ...r[key], status: "done", count: 45 } }));
      }
    }, 900);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.9rem", fontWeight: 700, marginBottom: 6 }}><Bot size={16} /> مدیریت اسکرپر</div>
      <div style={{ fontSize: "0.75rem", color: C.muted, marginBottom: 20 }}>اجرای واقعی از <code style={{ fontFamily: "monospace", fontSize: "11px", background: "#0006", padding: "1px 5px", borderRadius: 4, color: "#38bdf8" }}>.github/workflows/scrape.yml</code> — این پنل برای تریگر دستی است.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
        {SCRAPER_SOURCES.map(src => {
          const run = runs[src.key]; const status = run?.status ?? "idle"; const isRunning = status === "running";
          return (
            <div key={src.key} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 600, fontSize: "0.85rem" }}><src.Icon size={14} /> {src.label}</div>
                <Badge
                  text={status === "idle" ? "آماده" : status === "running" ? "در حال اجرا" : status === "done" ? `${run?.count ?? ""} انجام شد` : "خطا"}
                  color={status === "done" ? C.green : status === "running" ? C.accent : status === "error" ? "#ef4444" : C.muted}
                  bg={status === "done" ? "rgba(34,197,94,0.1)" : "rgba(255,77,0,0.06)"}
                />
              </div>
              {run?.log && <div style={{ background: C.bg, borderRadius: 8, padding: "8px 10px", maxHeight: 100, overflowY: "auto", marginBottom: 12, fontSize: "0.7rem", color: C.muted, fontFamily: "monospace", lineHeight: 1.6 }}>{run.log.map((l, i) => <div key={i}>{l}</div>)}</div>}
              <button onClick={() => startRun(src.key)} disabled={isRunning || !canRun} style={{ width: "100%", padding: "9px 0", borderRadius: 8, border: "none", background: isRunning || !canRun ? C.surface : C.accent, color: isRunning || !canRun ? C.muted : "#fff", fontFamily: C.font, fontSize: "0.8rem", fontWeight: 700, cursor: isRunning || !canRun ? "default" : "pointer" }}>
                {isRunning ? "در حال اجرا..." : !canRun ? "دسترسی ندارید" : "اجرا"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
