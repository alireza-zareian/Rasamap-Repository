import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/client/next-path";

/**
 * The staff sign-in used to be a page of its own beside /login, with its own
 * copy of the form. /login signs both kinds of account in (lib/auth/sign-in.ts)
 * and has a staff tab, so this address — still in bookmarks and in the panel's
 * old links — forwards there, keeping where the person was headed.
 */
export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNextPath((await searchParams).next ?? null);
  redirect(next ? `/login?as=staff&next=${encodeURIComponent(next)}` : "/login?as=staff");
}
