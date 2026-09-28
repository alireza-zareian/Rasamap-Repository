import { readUpload } from "@/lib/uploads";

// GET /uploads/... — uploaded photos from UPLOAD_DIR, outside public/ (lib/uploads.ts).
// proxy.ts has applied the hotlink check before this runs.
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const file = await readUpload((await params).path);
  if (!file) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "X-Content-Type-Options": "nosniff",
      // Each upload gets a fresh random folder and is never rewritten.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
