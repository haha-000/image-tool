/**
 * 用户反馈/投诉通道 — EdgeOne Node Functions 移植版（node-functions/api/feedback.js → POST /api/feedback）
 * 反馈内容（含联系方式）写入函数日志，EdgeOne 控制台按 "feedback" 过滤查看和回访。
 */

export async function onRequestPost(context) {
  const { request } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "请求格式错误" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const message = String(body.message || "").trim().slice(0, 1000);
  if (!message) {
    return new Response(JSON.stringify({ error: "请填写反馈内容" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
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

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
}
