/**
 * 用户反馈 / 投诉通道
 *
 * 落地：Upstash KV（feedback 列表，保留最近 500 条）+ 结构化日志。
 * 登录用户的反馈自动关联 uid，可直接回访。
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySession, recordFeedback } from "@/lib/auth-server";
import { kvEnabled } from "@/lib/upstash";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { message?: string; contact?: string; page?: string; userId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const message = String(body.message || "").trim().slice(0, 1000);
  if (!message) {
    return NextResponse.json({ error: "请填写反馈内容" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  let uid: string | undefined;
  if (kvEnabled()) {
    const user = await verifySession(req.headers.get("x-auth-token"));
    if (user) uid = user.uid;
  }
  const anonId = uid ? undefined : String(body.userId || "anon").slice(0, 64);
  const contact = String(body.contact || "").slice(0, 100);

  if (kvEnabled()) {
    await recordFeedback({ uid, anonId, message, contact, page: String(body.page || ""), ip });
  } else {
    console.log(
      JSON.stringify({ t: "feedback", ts: new Date().toISOString(), anonId, uid: uid || null, contact: contact || null, ip, message })
    );
  }

  return NextResponse.json({ ok: true });
}
