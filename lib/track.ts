/**
 * 轻量运营埋点（MVP 版，零依赖零数据库）
 *
 * 设计：
 * - 匿名用户 ID：首次访问生成 UUID 存 LocalStorage，此后每次事件携带 ——
 *   不需要注册登录也能在服务端日志里区分独立用户、统计留存；
 * - 事件上报：fire-and-forget POST /api/track，不阻塞界面、失败静默；
 * - 数据落地：服务端结构化 JSON 日志（Vercel 控制台可过滤统计），见 OPERATIONS.md；
 *   MVP 验证通过后，把 /api/track 的落地点换成数据库（Supabase 等）即可升级为正式后台。
 */

const USER_KEY = "tuke-uid-v1";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxxyxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** 获取匿名用户 ID（不存在则创建） */
export function getUserId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(USER_KEY);
  if (!id) {
    id = uuid();
    localStorage.setItem(USER_KEY, id);
  }
  return id;
}

export interface TrackProps {
  [k: string]: string | number | boolean | undefined | null;
}

/** 上报一个运营事件（不抛错、不等待）；登录用户自动附带 token，服务端解析为 uid 主键 */
export function track(event: string, props: TrackProps = {}): void {
  if (typeof window === "undefined") return;
  let payload: string;
  try {
    const token = localStorage.getItem("tuke-token-v1"); // 与 lib/auth.ts 的 TOKEN_KEY 一致
    payload = JSON.stringify({ event, userId: getUserId(), token: token || undefined, props });
  } catch {
    return;
  }
  try {
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true, // 页面即将卸载时也能送达
    }).catch(() => {});
  } catch {
    // 埋点失败绝不影响主流程
  }
}
