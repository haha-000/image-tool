/**
 * 用户反馈/投诉通道 — EdgeOne Node Functions 版（POST /api/feedback）
 * KV 配置时存 feedback 列表（关联 uid），否则降级日志。
 */

import { verifySession, recordFeedback, kvEnabled, json, clientIp } from "./_lib.js";

export async function onRequestPost(context) {
  const { request } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求格式错误" }, 400);
  }

  const message = String(body.message || "").trim().slice(0, 1000);
  if (!message) return json({ error: "请填写反馈内容" }, 400);

  const ip = clientIp(request);
  let uid;
  if (kvEnabled()) {
    const user = await verifySession(request.headers.get("x-auth-token"));
    if (user) uid = user.uid;
  }
  const anonId = uid ? undefined : String(body.userId || "anon").slice(0, 64);
  const contact = String(body.contact || "").slice(0, 100);

  if (kvEnabled()) {
    await recordFeedback({ uid, anonId, message, contact, page: String(body.page || ""), ip });
  } else {
    console.log(JSON.stringify({ t: "feedback", ts: new Date().toISOString(), anonId, uid: uid || null, contact: contact || null, ip, message }));
  }

  return json({ ok: true });
}
