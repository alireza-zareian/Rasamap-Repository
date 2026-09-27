import { Lock } from "lucide-react";
import { requireStaff } from "@/lib/auth/actor";
import { hasRole } from "@/lib/domain/roles";
import { SectionCard } from "@/components/admin/Badge";
import { AuditPanel } from "@/components/admin/AuditPanel";
import own from "@/components/admin/AuditPanel.module.css";

export default async function AuditSection() {
  const staff = await requireStaff();
  return (
    <SectionCard>
      {hasRole(staff.role, "admin")
        ? <AuditPanel />
        : <div className={own.locked}><Lock size={16} /> این بخش فقط برای نقش «ادمین» و بالاتر است</div>}
    </SectionCard>
  );
}
