/**
 * 共享库（非路由）— EdgeOne Node Functions 版 upstash + auth 逻辑
 * 与 Next.js 版 lib/upstash.ts + lib/auth-server.ts 保持同构（数据结构一致，两边可互写）。
 */

import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

const KV_URL = process.env.UPSTASH_REDIS_REST_URL || "";
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

export const kvEnabled = () => Boolean(KV_URL && KV_TOKEN);

async function kvRaw(body) {
  const r = await fetch(KV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j.result ?? null;
}

export const kv = (cmd) => (kvEnabled() ? kvRaw(cmd) : null);
export const kvPipe = (cmds) => (kvEnabled() ? kvRaw(cmds) : null);
export const adminTokenOk = (t) => Boolean(ADMIN_TOKEN) && t === ADMIN_TOKEN;

/* ── auth ── */
const SESSION_TTL_SEC = 30 * 24 * 3600;

const hashPw = (pw, salt) => pbkdf2Sync(pw, salt, 100000, 32, "sha256").toString("hex");
const newUid = () => "u_" + randomBytes(9).toString("hex");

export function normalizeEmail(e) {
  return String(e || "").trim().toLowerCase().slice(0, 200);
}

export async function registerUser(emailRaw, passwordRaw, ip) {
  const email = normalizeEmail(emailRaw);
  const password = String(passwordRaw || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, status: 400, error: "邮箱格式不正确" };
  if (password.length < 8 || password.length > 72) return { ok: false, status: 400, error: "密码需 8-72 位" };

  const existing = await kv(["GET", `u:email:${email}`]);
  if (existing) return { ok: false, status: 409, error: "该邮箱已注册，请直接登录" };

  const uid = newUid();
  const salt = randomBytes(16).toString("hex");
  const now = new Date().toISOString();
  const record = { uid, email, ph: hashPw(password, salt), salt, createdAt: now, lastLoginAt: now, regIp: ip };

  const created = await kvPipe([
    ["SET", `u:email:${email}`, uid, "NX"],
    ["SET", `u:${uid}`, JSON.stringify(record)],
    ["SADD", "users", uid],
  ]);
  if (created && created[0] && created[0].result === null) {
    return { ok: false, status: 409, error: "该邮箱已注册" };
  }

  const token = randomBytes(24).toString("hex");
  await kvPipe([
    ["SET", `s:${token}`, uid, "EX", SESSION_TTL_SEC],
    ["HINCRBY", "stats", "users_total", 1],
  ]);
  console.log(JSON.stringify({ t: "auth_register", uid, email, ip, ts: now }));
  return { ok: true, status: 201, uid, email, token };
}

export async function loginUser(emailRaw, passwordRaw, ip) {
  const email = normalizeEmail(emailRaw);
  const password = String(passwordRaw || "");
  if (!email || !password) return { ok: false, status: 400, error: "请输入邮箱和密码" };

  const uid = await kv(["GET", `u:email:${email}`]);
  if (!uid) return { ok: false, status: 401, error: "邮箱或密码错误" };

  const raw = await kv(["GET", `u:${uid}`]);
  let user = null;
  try {
    user = raw ? JSON.parse(raw) : null;
  } catch {}
  if (!user) return { ok: false, status: 401, error: "邮箱或密码错误" };

  const given = Buffer.from(hashPw(password, user.salt), "hex");
  const stored = Buffer.from(user.ph, "hex");
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
    return { ok: false, status: 401, error: "邮箱或密码错误" };
  }

  const token = randomBytes(24).toString("hex");
  const now = new Date().toISOString();
  await kvPipe([
    ["SET", `s:${token}`, uid, "EX", SESSION_TTL_SEC],
    ["SET", `u:${uid}`, JSON.stringify({ ...user, lastLoginAt: now })],
  ]);
  console.log(JSON.stringify({ t: "auth_login", uid, email, ip, ts: now }));
  return { ok: true, status: 200, uid, email, token };
}

export async function verifySession(token) {
  if (!token || !/^[a-f0-9]{48}$/.test(token)) return null;
  const uid = await kv(["GET", `s:${token}`]);
  if (!uid) return null;
  const raw = await kv(["GET", `u:${uid}`]);
  try {
    const u = raw ? JSON.parse(raw) : null;
    return u ? { uid: u.uid, email: u.email } : null;
  } catch {
    return null;
  }
}

export async function logoutSession(token) {
  if (token && /^[a-f0-9]{48}$/.test(token)) await kv(["DEL", `s:${token}`]);
}

/* ── 事件/反馈落库（与 Next.js 版一致） ── */
export async function recordEvent({ event, uid, anonId, ip, ua, props }) {
  const ts = Date.now();
  const entry = JSON.stringify({
    t: "track",
    ts: new Date(ts).toISOString(),
    event,
    uid: uid || null,
    anonId: anonId || null,
    ip,
    ua: (ua || "").slice(0, 200),
    p: props,
  });
  const cmds = [
    ["ZADD", "ev", ts, entry],
    ["HINCRBY", "stats", `ev:${event}`, 1],
    ["HINCRBY", "stats", "ev_total", 1],
  ];
  if (uid) {
    const today = new Date().toISOString().slice(0, 10);
    cmds.push(["LPUSH", `ue:${uid}`, entry]);
    cmds.push(["LTRIM", `ue:${uid}`, 0, 199]);
    cmds.push(["SADD", `dau:${today}`, uid]);
  }
  await kvPipe(cmds);
}

export async function recordFeedback({ uid, anonId, message, contact, page, ip }) {
  const entry = JSON.stringify({
    t: "feedback",
    ts: new Date().toISOString(),
    uid: uid || null,
    anonId: anonId || null,
    contact: (contact || "").slice(0, 200),
    message: (message || "").slice(0, 2000),
    page: (page || "").slice(0, 200),
    ip,
  });
  await kvPipe([
    ["LPUSH", "feedback", entry],
    ["LTRIM", "feedback", 0, 499],
    ["HINCRBY", "stats", "feedback_total", 1],
  ]);
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function clientIp(request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
