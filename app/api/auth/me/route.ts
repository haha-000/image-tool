/** 当前用户：GET /api/auth/me（头 x-auth-token）→ {uid, email} */

import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await verifySession(req.headers.get("x-auth-token"));
  if (!user) return NextResponse.json({ error: "未登录或会话过期" }, { status: 401 });
  return NextResponse.json(user);
}
