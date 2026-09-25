import { readUpload } from "@/lib/uploads";

// GET /uploads/... — photos written after the server started. See readUpload()
// for why this exists; files present at boot never reach it. proxy.ts has
// already applied the hotlink check by the time a request gets here.
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const file = await readUpload((await params).path);
  if (!file) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "X-Content-Type-Options": "nosniff",
      // Every upload lands under a fresh random folder and is never rewritten.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
