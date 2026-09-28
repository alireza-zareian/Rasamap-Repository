import type { Metadata } from "next";
import MediaPage, { mediaMetadata } from "./MediaPage";

/**
 * A media page as every visitor gets it. It reads no cookie, so after its first
 * request it is served from the cache like a static page (§39) — one render
 * cost 22 ms of CPU, a cached copy about 3. It is rebuilt when the catalogue
 * tag is dropped (a write in lib/db/billboards) or after the catalogue's TTL.
 * A staff session and an unknown slug never land here: proxy.ts rewrites both
 * to ./preview, which is not cached.
 */

/** None at build time: each page is rendered on its first request, then kept. */
export function generateStaticParams(): { slug: string }[] {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return mediaMetadata((await params).slug);
}

export default async function BillboardPage({ params }: { params: Promise<{ slug: string }> }) {
  return <MediaPage slug={(await params).slug} staffPreview={false} />;
}
