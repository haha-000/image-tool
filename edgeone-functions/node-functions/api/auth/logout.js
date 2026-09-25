/** 登出 — EdgeOne 版（POST /api/auth/logout，头 x-auth-token） */

import { logoutSession, json } from "../_lib.js";

export async function onRequestPost(context) {
  await logoutSession(context.request.headers.get("x-auth-token"));
  return json({ ok: true });
}
