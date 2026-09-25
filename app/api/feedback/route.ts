/**
 * 用户反馈 / 投诉通道（零数据库 MVP 版）
 *
 * 反馈内容（含联系方式）以结构化 JSON 写入服务端日志，
 * Vercel 控制台按 "feedback" 过滤即可查看和回访用户。
 * MVP 验证后：换成数据库表 + 管理后台，或接邮件通知（Resend）。
 */

import { NextRequest, NextResponse } from "next/server";

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

  console.log(
    JSON.stringify({
      t: "feedback",
      ts: new Date().toISOString(),
      userId: String(body.userId || "anon").slice(0, 64),
      page: String(body.page || "").slice(0, 200),
      contact: String(body.contact || "").slice(0, 100) || null,
      ip,
      message,
    })
  );

  return NextResponse.json({ ok: true });
}
