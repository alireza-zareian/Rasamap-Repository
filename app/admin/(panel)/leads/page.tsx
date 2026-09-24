import { requireStaff } from "@/lib/auth/actor";
import { hasRole } from "@/lib/domain/roles";
import { SectionCard } from "@/components/admin/Badge";
import { LeadsPanel } from "@/components/admin/LeadsPanel";

export default async function LeadsSection() {
  const staff = await requireStaff();
  return <SectionCard><LeadsPanel canEdit={hasRole(staff.role, "editor")} /></SectionCard>;
}
