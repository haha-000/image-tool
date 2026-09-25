/** 运营分析 — EdgeOne 版（GET /api/admin/stats?token=xxx[&uid=|&email=]），与 Next.js 版同口径 */

import { kv, kvEnabled, adminTokenOk, json, normalizeEmail } from "../_lib.js";

function parseEv(s) {
  try {
    return typeof s === "string" ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export async function onRequestGet(context) {
  if (!kvEnabled()) return json({ error: "数据库未配置" }, 503);
  const url = new URL(context.request.url);
  if (!adminTokenOk(url.searchParams.get("token"))) return json({ error: "无权限" }, 401);

  const uidQ = url.searchParams.get("uid");
  const emailQ = url.searchParams.get("email");
  if (uidQ || emailQ) {
    let uid = uidQ;
    if (!uid && emailQ) uid = await kv(["GET", `u:email:${normalizeEmail(emailQ)}`]);
    if (!uid) return json({ error: "用户不存在" }, 404);
    const raw = await kv(["GET", `u:${uid}`]);
    if (!raw) return json({ error: "用户不存在" }, 404);
    const user = JSON.parse(raw);
    const events = ((await kv(["LRANGE", `ue:${uid}`, 0, 99])) || []).map(parseEv).filter(Boolean);
    return json({
      user: { uid: user.uid, email: user.email, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt, regIp: user.regIp },
      eventCount: events.length,
      recentEvents: events.slice(0, 50),
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const since24h = Date.now() - 24 * 3600 * 1000;

  const [stats, usersTotal, dauToday, evTotal, ev24hRaw, feedbackRaw] = await Promise.all([
    kv(["HGETALL", "stats"]),
    kv(["SCARD", "users"]),
    kv(["SCARD", `dau:${today}`]),
    kv(["ZCARD", "ev"]),
    kv(["ZRANGEBYSCORE", "ev", String(since24h), "+inf"]),
    kv(["LRANGE", "feedback", 0, 19]),
  ]);

  const byType = {};
  const activeUids24h = new Set();
  for (const raw of ev24hRaw || []) {
    const ev = parseEv(raw);
    if (!ev) continue;
    byType[ev.event] = (byType[ev.event] || 0) + 1;
    if (ev.uid) activeUids24h.add(ev.uid);
  }

  const dailyActive = {};
  for (let d = 6; d >= 0; d--) {
    const day = new Date(Date.now() - d * 24 * 3600 * 1000).toISOString().slice(0, 10);
    dailyActive[day] = (await kv(["SCARD", `dau:${day}`])) || 0;
  }

  const feedback = (feedbackRaw || [])
    .map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return json({
    generatedAt: new Date().toISOString(),
    totals: { users: usersTotal || 0, events: evTotal || 0, feedback: Number((stats && stats.feedback_total) || 0) },
    today: { activeUsers: dauToday || 0, events24h: (ev24hRaw || []).length, activeUids24h: activeUids24h.size },
    events24hByType: byType,
    dailyActiveLast7d: dailyActive,
    recentFeedback: feedback,
  });
}
