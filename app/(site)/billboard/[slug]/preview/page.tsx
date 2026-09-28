import type { Metadata } from "next";
import { getActor } from "@/lib/auth/actor";
import MediaPage, { mediaMetadata } from "../MediaPage";

/**
 * The uncached media page. proxy.ts rewrites /billboard/[slug] here for a staff
 * session (on the cookie's claim) and for a slug no row has, whose 404 must not
 * be stored; the address bar keeps the public URL. The claim proves nothing, so
 * the account is read again: only real staff get the preview, anyone else the
 * public view.
 */

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { ...(await mediaMetadata((await params).slug)), robots: { index: false, follow: false } };
}

export default async function StaffPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const staffPreview = (await getActor())?.kind === "staff";
  return <MediaPage slug={(await params).slug} staffPreview={staffPreview} />;
}
