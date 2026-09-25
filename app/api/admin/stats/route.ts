/**
 * 运营分析接口（ADMIN_TOKEN 保护）
 *
 * GET /api/admin/stats?token=xxx            → 全局概览
 * GET /api/admin/stats?token=xxx&uid=u_xxx  → 单用户档案 + 行为轨迹
 * GET /api/admin/stats?token=xxx&email=a@b.c→ 按邮箱查用户
 *
 * 返回（概览）：
 *   usersTotal / newUsers24h / activeToday(DAU) / eventsTotal
 *   events24hByType / recentFeedback / last7d 活跃
 */

import { NextRequest, NextResponse } from "next/server";
import { kv, kvPipe, kvEnabled, adminTokenOk } from "@/lib/upstash";

export const runtime = "nodejs";

interface Ev {
  ts: string;
  event: string;
  uid: string | null;
  anonId?: string | null;
  p?: Record<string, unknown>;
}

function parseEv(s: unknown): Ev | null {
  try {
    return typeof s === "string" ? (JSON.parse(s) as Ev) : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!kvEnabled())
    return NextResponse.json({ error: "数据库未配置" }, { status: 503 });

  const url = new URL(req.url);
  if (!adminTokenOk(url.searchParams.get("token"))) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }

  /* ── 单用户查询模式 ── */
  const uidQ = url.searchParams.get("uid");
  const emailQ = url.searchParams.get("email");
  if (uidQ || emailQ) {
    let uid = uidQ;
    if (!uid && emailQ) {
      uid = (await kv(["GET", `u:email:${emailQ.trim().toLowerCase()}`])) as string | null;
    }
    if (!uid) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

    const raw = (await kv(["GET", `u:${uid}`])) as string | null;
    if (!raw) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    const user = JSON.parse(raw) as { uid: string; email: string; createdAt: string; lastLoginAt?: string; regIp?: string };
    const events = (((await kv(["LRANGE", `ue:${uid}`, 0, 99])) as string[]) || [])
      .map(parseEv)
      .filter(Boolean);
    return NextResponse.json({
      user: { uid: user.uid, email: user.email, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt, regIp: user.regIp },
      eventCount: events.length,
      recentEvents: events.slice(0, 50),
    });
  }

  /* ── 概览模式 ── */
  const today = new Date().toISOString().slice(0, 10);
  const since24h = Date.now() - 24 * 3600 * 1000;

  const [stats, usersTotal, dauToday, evTotal, ev24hRaw, feedbackRaw, ev7dRaw] = await Promise.all([
    kv(["HGETALL", "stats"]) as Promise<Record<string, string> | null>,
    kv(["SCARD", "users"]) as Promise<number | null>,
    kv(["SCARD", `dau:${today}`]) as Promise<number | null>,
    kv(["ZCARD", "ev"]) as Promise<number | null>,
    kv(["ZRANGEBYSCORE", "ev", String(since24h), "+inf"]) as Promise<string[] | null>,
    kv(["LRANGE", "feedback", 0, 19]) as Promise<string[] | null>,
    kv(["ZRANGEBYSCORE", "ev", String(Date.now() - 7 * 24 * 3600 * 1000), "+inf"]) as Promise<string[] | null>,
  ]);

  // 24h 事件分类统计 + 活跃用户（登录）去重
  const byType: Record<string, number> = {};
  const activeUids24h = new Set<string>();
  for (const raw of ev24hRaw || []) {
    const ev = parseEv(raw);
    if (!ev) continue;
    byType[ev.event] = (byType[ev.event] || 0) + 1;
    if (ev.uid) activeUids24h.add(ev.uid);
  }

  // 最近 7 天逐日活跃（登录用户数）
  const dailyActive: Record<string, number> = {};
  for (let d = 6; d >= 0; d--) {
    const day = new Date(Date.now() - d * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const n = (await kv(["SCARD", `dau:${day}`])) as number | null;
    dailyActive[day] = n || 0;
  }

  const feedback = (feedbackRaw || []).map((s) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }).filter(Boolean);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    totals: {
      users: usersTotal || 0,
      events: evTotal || 0,
      feedback: Number(stats?.feedback_total || 0),
    },
    today: {
      activeUsers: dauToday || 0,
      events24h: (ev24hRaw || []).length,
      activeUids24h: activeUids24h.size,
    },
    events24hByType: byType,
    dailyActiveLast7d: dailyActive,
    recentFeedback: feedback,
  });
}
