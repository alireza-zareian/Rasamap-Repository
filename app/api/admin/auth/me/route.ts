import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { adminApiRateLimit } from "@/lib/rate-limit";

// GET /api/admin/auth/me — the signed-in staff member, safe fields only.
export const GET = defineRoute(
  { name: "admin/auth/me", access: { staff: "viewer" }, rateLimit: adminApiRateLimit },
  async ({ actor }) => NextResponse.json({
    user: { id: String(actor.id), email: actor.email, name: actor.name, role: actor.role },
  }),
);
