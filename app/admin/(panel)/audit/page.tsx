import { Lock } from "lucide-react";
import { requireStaff } from "@/lib/auth/actor";
import { hasRole } from "@/lib/domain/roles";
import { SectionCard } from "@/components/admin/Badge";
import { AuditPanel } from "@/components/admin/AuditPanel";

export default async function AuditSection() {
  const staff = await requireStaff();
  return (
    <SectionCard>
      {hasRole(staff.role, "admin")
        ? <AuditPanel />
        : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 40, color: "var(--text-muted)" }}><Lock size={16} /> دسترسی فقط برای Admin</div>}
    </SectionCard>
  );
}
