import { defineRoute } from "@/lib/http/route";
import { signOut } from "@/lib/auth/sign-in";

// POST /api/admin/auth/logout — the panel's sign-out; the same as
// POST /api/auth/logout. Not rate limited: see "none" in lib/http/route.ts.
export const POST = defineRoute(
  { name: "admin/auth/logout", access: "public", rateLimit: "none" },
  async ({ req, ip, userAgent }) => signOut(req, { ip, userAgent }),
);
