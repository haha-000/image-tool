/** 登录 — EdgeOne 版（POST /api/auth/login） */

import { loginUser, kvEnabled, json, clientIp } from "../_lib.js";

export async function onRequestPost(context) {
  if (!kvEnabled()) return json({ error: "数据库未配置（UPSTASH_REDIS_REST_*）" }, 503);
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "请求格式错误" }, 400);
  }
  const r = await loginUser(body.email, body.password, clientIp(context.request));
  return r.ok ? json({ uid: r.uid, email: r.email, token: r.token }) : json({ error: r.error }, r.status);
}
