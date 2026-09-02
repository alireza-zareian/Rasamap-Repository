import type { Billboard } from "@/lib/types";
import { Check, AlertTriangle } from "lucide-react";
import { C, STATUS_LABEL, STATUS_COLOR, TYPE_LABEL } from "./constants";
import { TypeIcon } from "@/components/TypeIcon";
import { Badge } from "./Badge";

export function BillboardRow({ b, onEdit, onDelete }: { b: Billboard; onEdit: (b: Billboard) => void; onDelete: (b: Billboard) => void }) {
  const [sc, sbg] = STATUS_COLOR[b.status as string] ?? [C.muted, C.surface];
  return (
    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
      <td style={{ padding: "10px 12px", fontSize: "0.82rem", fontWeight: 600, color: C.text, maxWidth: 240 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span style={{ display: "flex", flexShrink: 0, color: C.muted }}><TypeIcon type={b.type} size={13} /></span>
          {b.name}
        </div>
        <div style={{ fontSize: "0.68rem", color: C.muted, marginTop: 2 }}>{b.city} · {b.location?.slice(0, 38)}</div>
      </td>
      <td style={{ padding: "10px 8px", fontSize: "0.78rem", color: C.muted }}>{TYPE_LABEL[b.type] ?? b.type}</td>
      <td style={{ padding: "10px 8px" }}><Badge text={STATUS_LABEL[b.status as string] ?? b.status} color={sc} bg={sbg} /></td>
      <td style={{ padding: "10px 8px", fontSize: "0.78rem", color: C.text }}>{b.price}M</td>
      <td style={{ padding: "10px 8px", fontSize: "0.75rem" }}>
        {b.lat && b.lng
          ? <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: C.green }}><Check size={12} /> {b.lat.toFixed(4)}</span>
          : <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "#f59e0b" }}><AlertTriangle size={12} /> ندارد</span>}
      </td>
      <td style={{ padding: "10px 8px", fontSize: "0.75rem" }}>
        {b.images?.length > 0
          ? <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: C.green }}><Check size={12} /> {b.images.length}</span>
          : <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "#f59e0b" }}><AlertTriangle size={12} /> ۰</span>}
      </td>
      <td style={{ padding: "10px 8px", fontSize: "0.75rem", color: C.muted }}>{b.source ?? "manual"}</td>
      <td style={{ padding: "10px 8px" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => onEdit(b)} style={{ fontSize: "0.75rem", padding: "5px 12px", borderRadius: 7, background: "rgba(255,77,0,0.1)", color: C.accent, border: "1px solid rgba(255,77,0,0.3)", cursor: "pointer", fontFamily: C.font, fontWeight: 600 }}>ویرایش</button>
          <button onClick={() => onDelete(b)} style={{ fontSize: "0.75rem", padding: "5px 10px", borderRadius: 7, background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)", cursor: "pointer", fontFamily: C.font }}>حذف</button>
        </div>
      </td>
    </tr>
  );
}
