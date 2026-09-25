/**
 * Upstash Redis REST 客户端（服务端专用）
 *
 * 免费版 1 万命令/天，REST API 可同时被 Vercel Functions 和 EdgeOne Node Functions
 * 调用（纯 HTTP，无 SDK 依赖）。未配置时返回降级模式（事件仅落日志）。
 *
 * 环境变量：
 *   UPSTASH_REDIS_REST_URL   例：https://abc123.upstash.io
 *   UPSTASH_REDIS_REST_TOKEN 例：AXxxxxxxxxxxxx
 */

const URL_ENV = process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN_ENV = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

export function kvEnabled(): boolean {
  return Boolean(URL_ENV && TOKEN_ENV);
}

export function adminTokenOk(token: string | null): boolean {
  return Boolean(ADMIN_TOKEN) && token === ADMIN_TOKEN;
}

/** 执行单条 Redis 命令 */
export async function kv(cmd: (string | number)[]): Promise<unknown | null> {
  if (!kvEnabled()) return null;
  try {
    const r = await fetch(URL_ENV, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN_ENV}` },
      body: JSON.stringify(cmd),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { result?: unknown };
    return j.result ?? null;
  } catch {
    return null;
  }
}

/** 批量执行（pipeline，只算一次网络往返） */
export async function kvPipe(cmds: (string | number)[][]): Promise<unknown[] | null> {
  if (!kvEnabled()) return null;
  try {
    const r = await fetch(URL_ENV, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN_ENV}` },
      body: JSON.stringify(cmds),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { result?: unknown[] };
    return j.result ?? null;
  } catch {
    return null;
  }
}
