import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { withApiLog } from "@/lib/api-log";

async function GETHandler() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
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
