import { defineRoute } from "@/lib/http/route";
import { signOut } from "@/lib/auth/sign-in";

// POST /api/auth/logout — sign this browser out, customer or staff. Not rate
// limited: see "none" in lib/http/route.ts.
export const POST = defineRoute(
  { name: "auth/logout", access: "public", rateLimit: "none" },
  async ({ req, ip, userAgent }) => signOut(req, { ip, userAgent }),
);
