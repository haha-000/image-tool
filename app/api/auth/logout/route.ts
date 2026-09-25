/** 登出：POST /api/auth/logout（头 x-auth-token） */

import { NextRequest, NextResponse } from "next/server";
import { logout } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  await logout(req.headers.get("x-auth-token"));
  return NextResponse.json({ ok: true });
}
