import { requireStaff } from "@/lib/auth/actor";
import { hasRole } from "@/lib/domain/roles";
import { getAdminBillboardPage } from "@/lib/db/billboards";
import { SectionCard } from "@/components/admin/Badge";
import { QualityWorkspace } from "@/components/admin/QualityWorkspace";

/** The quality checks run over the first hundred rows by id. */
const SAMPLE = 100;

export default async function QualitySection() {
  const staff = await requireStaff();
  const { items } = await getAdminBillboardPage({ sortKey: "id", sortDir: "asc", page: 1, limit: SAMPLE });
  return <SectionCard><QualityWorkspace initial={items} canEdit={hasRole(staff.role, "editor")} /></SectionCard>;
}
