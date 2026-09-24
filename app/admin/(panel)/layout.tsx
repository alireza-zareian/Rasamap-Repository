import { requireStaff } from "@/lib/auth/actor";
import { AdminShell } from "@/components/admin/AdminShell";

/**
 * Every panel section, framed. The account is checked here, on the server,
 * before anything is rendered — the panel used to render a "checking your
 * session…" screen and ask /api/admin/auth/me from the browser first.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  return <AdminShell user={{ name: staff.name, role: staff.role }}>{children}</AdminShell>;
}
