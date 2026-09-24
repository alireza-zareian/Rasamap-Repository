import { requireStaff } from "@/lib/auth/actor";
import { SectionCard } from "@/components/admin/Badge";
import { UsersPanel } from "@/components/admin/UsersPanel";

export default async function UsersSection() {
  const staff = await requireStaff();
  return (
    <SectionCard>
      <UsersPanel currentUser={{ id: String(staff.id), name: staff.name, role: staff.role, email: staff.email }} />
    </SectionCard>
  );
}
