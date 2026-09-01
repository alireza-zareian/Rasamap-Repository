import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

export async function GET() {
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
