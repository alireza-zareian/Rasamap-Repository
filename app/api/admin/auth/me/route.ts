import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { rateLimited } from "@/lib/api-rate-limit";
import { getStaffSession } from "@/lib/auth/users";
import { adminApiRateLimit } from "@/lib/auth/rate-limit";
import { withApiLog } from "@/lib/api-log";

async function GETHandler(req: NextRequest) {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  }

  // Rate limited like every other admin route, even though this one only reads
  // back the caller's own session. It was the single exception, and an
  // exception is what makes the next reader wonder whether the rule in rule 2
  // of AGENTS.md is a rule. The guard test below this file's sibling routes
  // now asserts there are none left.
  const ip = getClientIp(req);
  const rl = adminApiRateLimit(ip);
  if (!rl.allowed) {
    return rateLimited(rl, { endpoint: "admin/auth/me", ip, userId: session.userId, userEmail: session.email });
  }

  // Return only safe fields — never expose internal session details
  return NextResponse.json({
    user: {
      id:    session.userId,
      email: session.email,
      name:  session.name,
      role:  session.role,
    },
  });
}

export const GET = withApiLog("admin/auth/me", GETHandler);
