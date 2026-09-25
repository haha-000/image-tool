/** 当前用户 — EdgeOne 版（GET /api/auth/me，头 x-auth-token） */

import { verifySession, json } from "../_lib.js";

export async function onRequestGet(context) {
  const user = await verifySession(context.request.headers.get("x-auth-token"));
  return user ? json(user) : json({ error: "未登录或会话过期" }, 401);
}
