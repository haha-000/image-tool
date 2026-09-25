/**
 * 账号体系服务端逻辑：注册 / 登录 / 会话校验
 *
 * 数据结构（Upstash KV）：
 *   u:email:{email} → uid                     （邮箱查用户）
 *   u:{uid}        → JSON 用户档案（含密码哈希）
 *   users          → SET 全部 uid（统计用）
 *   s:{token}      → uid，TTL 30 天（会话）
 *
 * 密码：PBKDF2-SHA256 10 万次迭代 + 16 字节随机盐，只存哈希。
 */

import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import { kv, kvPipe } from "./upstash";

const SESSION_TTL_SEC = 30 * 24 * 3600;
const PBKDF2_ITER = 100_000;

export interface UserRecord {
  uid: string;
  email: string;
  ph: string; // password hash
  salt: string;
  createdAt: string;
  lastLoginAt?: string;
  regIp?: string;
}

export interface AuthResult {
  ok: boolean;
  status: number; // HTTP 状态
  error?: string;
  uid?: string;
  email?: string;
  token?: string;
}

function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, PBKDF2_ITER, 32, "sha256").toString("hex");
}

function newUid(): string {
  return "u_" + randomBytes(9).toString("hex"); // 18 位，如 u_3f9a2b8c1d4e5f6a7b
}

export function normalizeEmail(email: unknown): string {
  return String(email || "").trim().toLowerCase().slice(0, 200);
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** 注册：邮箱+密码 → {uid, email, token} */
export async function register(
  emailRaw: unknown,
  passwordRaw: unknown,
  ip: string
): Promise<AuthResult> {
  const email = normalizeEmail(emailRaw);
  const password = String(passwordRaw || "");
  if (!validEmail(email)) return { ok: false, status: 400, error: "邮箱格式不正确" };
  if (password.length < 8 || password.length > 72)
    return { ok: false, status: 400, error: "密码需 8-72 位" };

  // 已注册？
  const existing = (await kv(["GET", `u:email:${email}`])) as string | null;
  if (existing) return { ok: false, status: 409, error: "该邮箱已注册，请直接登录" };

  const uid = newUid();
  const salt = randomBytes(16).toString("hex");
  const now = new Date().toISOString();
  const record: UserRecord = {
    uid,
    email,
    ph: hashPassword(password, salt),
    salt,
    createdAt: now,
    lastLoginAt: now,
    regIp: ip,
  };

  // 单条 pipeline 完成全部写入（含会话），任何失败都不得谎报成功
  const token = randomBytes(24).toString("hex");
  const created = await kvPipe([
    ["SET", `u:email:${email}`, uid, "NX"], // NX：并发注册防重复
    ["SET", `u:${uid}`, JSON.stringify(record)],
    ["SADD", "users", uid],
    ["SET", `s:${token}`, uid, "EX", SESSION_TTL_SEC],
    ["HINCRBY", "stats", "users_total", 1],
  ]);
  if (!created) return { ok: false, status: 503, error: "数据库暂不可用，请稍后再试" };
  // NX 失败 = 并发下被别人抢注
  if ((created[0] as { result?: unknown })?.result === null) {
    return { ok: false, status: 409, error: "该邮箱已注册" };
  }

  console.log(JSON.stringify({ t: "auth_register", uid, email, ip, ts: now }));
  return { ok: true, status: 201, uid, email, token };
}

/** 登录：校验密码，返回新 token */
export async function login(
  emailRaw: unknown,
  passwordRaw: unknown,
  ip: string
): Promise<AuthResult> {
  const email = normalizeEmail(emailRaw);
  const password = String(passwordRaw || "");
  if (!email || !password) return { ok: false, status: 400, error: "请输入邮箱和密码" };

  const uid = (await kv(["GET", `u:email:${email}`])) as string | null;
  if (!uid) return { ok: false, status: 401, error: "邮箱或密码错误" };

  const raw = (await kv(["GET", `u:${uid}`])) as string | null;
  let user: UserRecord | null = null;
  try {
    user = raw ? (JSON.parse(raw) as UserRecord) : null;
  } catch {
    user = null;
  }
  if (!user) return { ok: false, status: 401, error: "邮箱或密码错误" };

  const given = Buffer.from(hashPassword(password, user.salt), "hex");
  const stored = Buffer.from(user.ph, "hex");
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
    return { ok: false, status: 401, error: "邮箱或密码错误" };
  }

  const token = randomBytes(24).toString("hex");
  const now = new Date().toISOString();
  const ok = await kvPipe([
    ["SET", `s:${token}`, uid, "EX", SESSION_TTL_SEC],
    ["SET", `u:${uid}`, JSON.stringify({ ...user, lastLoginAt: now })],
  ]);
  if (!ok) return { ok: false, status: 503, error: "数据库暂不可用，请稍后再试" };

  console.log(JSON.stringify({ t: "auth_login", uid, email, ip, ts: now }));
  return { ok: true, status: 200, uid, email, token };
}

/** 会话校验：token → {uid, email}；无效返回 null */
export async function verifySession(
  token: string | null
): Promise<{ uid: string; email: string } | null> {
  if (!token || !/^[a-f0-9]{48}$/.test(token)) return null;
  const uid = (await kv(["GET", `s:${token}`])) as string | null;
  if (!uid) return null;
  const raw = (await kv(["GET", `u:${uid}`])) as string | null;
  try {
    const u = raw ? (JSON.parse(raw) as UserRecord) : null;
    return u ? { uid: u.uid, email: u.email } : null;
  } catch {
    return null;
  }
}

/** 登出：删除会话 */
export async function logout(token: string | null): Promise<void> {
  if (token && /^[a-f0-9]{48}$/.test(token)) {
    await kv(["DEL", `s:${token}`]);
  }
}

/** 事件落库：全局事件流 + 单用户轨迹（原子化辨识的核心） */
export async function recordEvent(input: {
  event: string;
  uid?: string; // 登录用户（主键）
  anonId?: string; // 匿名设备 ID（未登录）
  ip: string;
  ua: string;
  props: Record<string, string | number | boolean>;
}): Promise<void> {
  const ts = Date.now();
  const entry = JSON.stringify({
    t: "track",
    ts: new Date(ts).toISOString(),
    event: input.event,
    uid: input.uid || null,
    anonId: input.anonId || null,
    ip: input.ip,
    ua: input.ua.slice(0, 200),
    p: input.props,
  });

  const cmds: (string | number)[][] = [
    ["ZADD", "ev", ts, entry], // 全局事件流（score=毫秒时间戳）
    ["HINCRBY", "stats", `ev:${input.event}`, 1], // 事件分类计数
    ["HINCRBY", "stats", "ev_total", 1],
  ];
  if (input.uid) {
    // 单用户轨迹（保留最近 200 条）+ 今日活跃标记
    const today = new Date().toISOString().slice(0, 10);
    cmds.push(["LPUSH", `ue:${input.uid}`, entry]);
    cmds.push(["LTRIM", `ue:${input.uid}`, 0, 199]);
    cmds.push(["SADD", `dau:${today}`, input.uid]);
  }
  await kvPipe(cmds);
}

/** 反馈落库 */
export async function recordFeedback(input: {
  uid?: string;
  anonId?: string;
  message: string;
  contact: string;
  page: string;
  ip: string;
}): Promise<void> {
  const entry = JSON.stringify({
    t: "feedback",
    ts: new Date().toISOString(),
    uid: input.uid || null,
    anonId: input.anonId || null,
    contact: input.contact.slice(0, 200),
    message: input.message.slice(0, 2000),
    page: input.page.slice(0, 200),
    ip: input.ip,
  });
  await kvPipe([
    ["LPUSH", "feedback", entry],
    ["LTRIM", "feedback", 0, 499],
    ["HINCRBY", "stats", "feedback_total", 1],
  ]);
}
