/**
 * 运营事件采集接口（零数据库 MVP 版）
 *
 * 事件以结构化 JSON 写入服务端日志，Vercel 控制台按 "track" 过滤即可看到：
 *   pv / tool_used / ai_success / ai_fail / download / paywall_open / recharge_sim / feedback
 * 统计口径见 OPERATIONS.md。MVP 验证后把本文件落地点换成数据库即可平滑升级。
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_PROPS = 20;

export async function POST(req: NextRequest) {
  let body: { event?: string; userId?: string; props?: Record<string, unknown> };
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
  const ua = (req.headers.get("user-agent") || "").slice(0, 200);

  // 只保留标量值、限制条数，防日志注入和刷量膨胀
  const props: Record<string, string | number | boolean> = {};
  let i = 0;
  for (const [k, v] of Object.entries(body.props || {})) {
    if (i++ >= MAX_PROPS) break;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      props[k] = typeof v === "string" ? v.slice(0, 300) : v;
    }
  }

  console.log(
    JSON.stringify({
      t: "track",
      ts: new Date().toISOString(),
      event,
      userId: String(body.userId || "anon").slice(0, 64),
      ip,
      ua,
      ...props,
    })
  );

  return new NextResponse(null, { status: 204 });
}
