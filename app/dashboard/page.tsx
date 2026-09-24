import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth/actor";
import { listOwnListings } from "@/lib/db/listings";
import DashboardClient from "@/components/DashboardClient";

/**
 * A customer's dashboard, with their listings read on the server.
 *
 * proxy.ts has already sent a signed-out visitor to sign in. A staff member
 * has no listings of their own — their dashboard is the panel.
 */
export default async function DashboardPage() {
  const actor = await getActor();
  if (!actor) redirect("/login?next=/dashboard");
  if (actor.kind === "staff") redirect("/admin");

  const listings = await listOwnListings(actor);
  return (
    <DashboardClient
      account={{ name: actor.name, phone: actor.phone }}
      initialListings={listings.map(l => ({ ...l, createdAt: l.createdAt.toISOString() }))}
    />
  );
}
