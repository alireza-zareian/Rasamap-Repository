import { faNum } from "@/lib/format";

export function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span style={{ fontSize: "0.68rem", padding: "3px 9px", borderRadius: 20, background: bg, color, fontWeight: 600, whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}

export function StatCard({ icon, label, value, color, sub }: { icon: React.ReactNode; label: string; value: string | number; color: string; sub?: string }) {
  const C = { card: "var(--bg-card)", border: "var(--border)", muted: "var(--text-muted)" };
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ display: "flex", color }}>{icon}</span>
        <span style={{ fontSize: "0.72rem", color: C.muted }}>{label}</span>
      </div>
      <div style={{ fontSize: "1.6rem", fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: "0.7rem", color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const C = { surface: "var(--bg-surface)", muted: "var(--text-muted)", text: "var(--text-main)" };
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: C.muted, marginBottom: 4 }}>
        <span>{label}</span><span style={{ color: C.text, fontWeight: 600 }}>{faNum(value)}</span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: C.surface, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${(value / max) * 100}%`, background: color, borderRadius: 4, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}
