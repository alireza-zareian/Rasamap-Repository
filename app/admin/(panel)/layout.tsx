import { requireStaff } from "@/lib/auth/actor";
import { AdminShell } from "@/components/admin/AdminShell";

/** Every panel section, framed; the account is checked on the server before anything renders. */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  return <AdminShell user={{ name: staff.name, role: staff.role }}>{children}</AdminShell>;
}
