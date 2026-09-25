/**
 * 运营事件采集 — EdgeOne Node Functions 版（POST /api/track）
 * 登录用户（token → uid 主键）> 匿名设备 ID；KV 配置时落库（全局流 + 单用户轨迹），否则降级日志。
 */

import { verifySession, recordEvent, kvEnabled } from "./_lib.js";

const MAX_PROPS = 20;

export async function onRequestPost(context) {
  const { request } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }

  const event = String(body.event || "").slice(0, 64);
  if (!event) return new Response(null, { status: 204 });

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const ua = request.headers.get("user-agent") || "";

  const props = {};
  let i = 0;
  for (const [k, v] of Object.entries(body.props || {})) {
    if (i++ >= MAX_PROPS) break;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      props[k] = typeof v === "string" ? v.slice(0, 300) : v;
    }
  }

  let uid, anonId;
  if (kvEnabled()) {
    const token = request.headers.get("x-auth-token") || String(body.token || "").slice(0, 64);
    const user = await verifySession(token);
    if (user) uid = user.uid;
  }
  if (!uid) anonId = String(body.userId || "anon").slice(0, 64);

  if (uid || kvEnabled()) {
    await recordEvent({ event, uid, anonId, ip, ua, props });
  } else {
    console.log(JSON.stringify({ t: "track", ts: new Date().toISOString(), event, anonId, ip, ua: ua.slice(0, 200), ...props }));
  }

  return new Response(null, { status: 204 });
}
