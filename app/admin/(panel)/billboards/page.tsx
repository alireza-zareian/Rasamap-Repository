import { requireStaff } from "@/lib/auth/actor";
import { hasRole } from "@/lib/domain/roles";
import { BillboardsPanel } from "@/components/admin/BillboardsPanel";

export default async function BillboardsSection({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const staff = await requireStaff();
  const { q } = await searchParams;
  return (
    <BillboardsPanel
      canEdit={hasRole(staff.role, "editor")}
      canManage={hasRole(staff.role, "admin")}
      initialQuery={typeof q === "string" ? q : ""}
    />
  );
}
