import { requireStaff } from "@/lib/auth/actor";
import { hasRole } from "@/lib/domain/roles";
import { SectionCard } from "@/components/admin/Badge";
import { ListingsPanel } from "@/components/admin/ListingsPanel";

export default async function ListingsSection() {
  const staff = await requireStaff();
  return <SectionCard><ListingsPanel canDecide={hasRole(staff.role, "admin")} /></SectionCard>;
}
