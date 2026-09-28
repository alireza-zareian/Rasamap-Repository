import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/client/next-path";

/** The old staff sign-in address: forwards to /login's staff mode, keeping `next`. */
export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNextPath((await searchParams).next ?? null);
  redirect(next ? `/login?as=staff&next=${encodeURIComponent(next)}` : "/login?as=staff");
}
