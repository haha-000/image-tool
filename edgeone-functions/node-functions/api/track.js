/**
 * 运营事件采集 — EdgeOne Node Functions 移植版（node-functions/api/track.js → POST /api/track）
 * 事件以结构化 JSON 写入 EdgeOne 函数日志，控制台按 "track" 过滤即可统计。
 */

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
  const ua = (request.headers.get("user-agent") || "").slice(0, 200);

  const props = {};
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

  return new Response(null, { status: 204 });
}
