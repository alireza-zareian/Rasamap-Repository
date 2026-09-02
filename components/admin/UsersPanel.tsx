"use client";
import type { UserRole } from "@/lib/auth/session";
import { C, ROLE_LABEL, ROLE_COLOR } from "./constants";
import { Badge } from "./Badge";
import { Users, Construction } from "lucide-react";

interface SessionUser { id: string; name: string; role: UserRole; email: string; }

export function UsersPanel({ currentUser }: { currentUser: SessionUser }) {
  const isSA = currentUser.role === "super_admin";
  const DEMO = [{ id: currentUser.id, name: currentUser.name, email: currentUser.email, role: currentUser.role, lastSeen: "همین الان" }];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.9rem", fontWeight: 700 }}><Users size={16} /> مدیریت کاربران</div>
          <div style={{ fontSize: "0.75rem", color: C.muted, marginTop: 4 }}>نقش‌ها: Super Admin، Admin، Editor، Viewer</div>
        </div>
        {isSA && <button style={{ fontSize: "0.78rem", padding: "7px 14px", borderRadius: 8, background: C.accent, border: "none", color: "#fff", fontFamily: C.font, fontWeight: 700, cursor: "pointer", opacity: 0.7 }}>+ افزودن</button>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        {([["super_admin","Super Admin","کامل"],["admin","Admin","مدیریت"],["editor","Editor","ویرایش"],["viewer","Viewer","مشاهده"]] as const).map(([r, l, d]) => (
          <div key={r} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, textAlign: "center" }}>
            <Badge text={l} color={ROLE_COLOR[r]} bg={`${ROLE_COLOR[r]}20`} />
            <div style={{ fontSize: "0.7rem", color: C.muted, marginTop: 6 }}>{d}</div>
          </div>
        ))}
      </div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: C.card }}>
              {["نام","ایمیل","نقش","آخرین ورود","وضعیت",""].map(h => (
                <th key={h} style={{ padding: "11px 14px", textAlign: "right", fontSize: "0.75rem", color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEMO.map(u => (
              <tr key={u.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "12px 14px", fontSize: "0.85rem", fontWeight: 600 }}>{u.name}</td>
                <td style={{ padding: "12px 14px", fontSize: "0.8rem", color: C.muted }}>{u.email}</td>
                <td style={{ padding: "12px 14px" }}><Badge text={ROLE_LABEL[u.role] ?? u.role} color={ROLE_COLOR[u.role] ?? C.muted} bg={`${ROLE_COLOR[u.role] ?? C.muted}18`} /></td>
                <td style={{ padding: "12px 14px", fontSize: "0.78rem", color: C.muted }}>{u.lastSeen}</td>
                <td style={{ padding: "12px 14px" }}><Badge text="فعال" color={C.green} bg="rgba(34,197,94,0.1)" /></td>
                <td style={{ padding: "12px 14px" }} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 16, padding: 14, background: "rgba(245,158,11,0.06)", borderRadius: 10, fontSize: "0.75rem", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.2)" }}>
        <Construction size={14} style={{ verticalAlign: "-2px" }} /> مدیریت کاربران نیاز به DB دارد. کاربر از env vars تعریف می‌شود: ADMIN_EMAIL و ADMIN_PASSWORD_HASH
      </div>
    </div>
  );
}
