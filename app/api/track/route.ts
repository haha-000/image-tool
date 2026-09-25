/**
 * 运营事件采集接口
 *
 * 优先级：登录用户（x-auth-token → uid 主键）> 匿名设备 ID。
 * 落地：Upstash KV（全局事件流 + 单用户轨迹 + 分类计数）+ 结构化日志（降级可查）。
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySession, recordEvent } from "@/lib/auth-server";
import { kvEnabled } from "@/lib/upstash";

export const runtime = "nodejs";

const MAX_PROPS = 20;

export async function POST(req: NextRequest) {
  let body: { event?: string; userId?: string; token?: string; props?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const event = String(body.event || "").slice(0, 64);
  if (!event) return new NextResponse(null, { status: 204 });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const ua = req.headers.get("user-agent") || "";

  // token 可来自 header（API 调用）或 body（页面埋点）
  const token = req.headers.get("x-auth-token") || String(body.token || "").slice(0, 64);

  // 只保留标量值、限制条数
  const props: Record<string, string | number | boolean> = {};
  let i = 0;
  for (const [k, v] of Object.entries(body.props || {})) {
    if (i++ >= MAX_PROPS) break;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      props[k] = typeof v === "string" ? v.slice(0, 300) : v;
    }
  }

  // 登录用户 → uid 主键；否则匿名设备 ID
  let uid: string | undefined;
  let anonId: string | undefined;
  if (kvEnabled()) {
    const user = await verifySession(token);
    if (user) uid = user.uid;
  }
  if (!uid) anonId = String(body.userId || "anon").slice(0, 64);

  if (uid || kvEnabled()) {
    await recordEvent({ event, uid, anonId, ip, ua, props });
  } else {
    // KV 未配置：降级为纯日志（原 MVP 模式）
    console.log(JSON.stringify({ t: "track", ts: new Date().toISOString(), event, anonId, ip, ua: ua.slice(0, 200), ...props }));
  }

  return new NextResponse(null, { status: 204 });
}
