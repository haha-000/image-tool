/** 注册：POST /api/auth/register {email, password} */

import { NextRequest, NextResponse } from "next/server";
import { register } from "@/lib/auth-server";
import { kvEnabled } from "@/lib/upstash";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!kvEnabled())
    return NextResponse.json({ error: "数据库未配置（UPSTASH_REDIS_REST_*）" }, { status: 503 });

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const r = await register(body.email, body.password, ip);
  return NextResponse.json(
    r.ok ? { uid: r.uid, email: r.email, token: r.token } : { error: r.error },
    { status: r.status }
  );
}
