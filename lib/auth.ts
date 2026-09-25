/**
 * 客户端认证（浏览器端）
 *
 * token 存 LocalStorage（30 天服务端会话），所有埋点自动附带。
 */

const TOKEN_KEY = "tuke-token-v1";
const USER_KEY = "tuke-user-v1"; // {uid, email} 缓存，避免每次都请求

export interface CurrentUser {
  uid: string;
  email: string;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getCachedUser(): CurrentUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as CurrentUser) : null;
  } catch {
    return null;
  }
}

function saveSession(user: CurrentUser, token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  // 通知全局刷新（Navbar 等）
  window.dispatchEvent(new CustomEvent("tuke-auth-change"));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new CustomEvent("tuke-auth-change"));
}

export async function registerUser(
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json();
    if (!r.ok) return { ok: false, error: j.error || "注册失败" };
    saveSession({ uid: j.uid, email: j.email }, j.token);
    return { ok: true };
  } catch {
    return { ok: false, error: "网络异常，请重试" };
  }
}

export async function loginUser(
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json();
    if (!r.ok) return { ok: false, error: j.error || "登录失败" };
    saveSession({ uid: j.uid, email: j.email }, j.token);
    return { ok: true };
  } catch {
    return { ok: false, error: "网络异常，请重试" };
  }
}

export async function logoutUser(): Promise<void> {
  const token = getToken();
  clearSession();
  try {
    if (token) await fetch("/api/auth/logout", { method: "POST", headers: { "x-auth-token": token } });
  } catch {
    // 忽略
  }
}

/** 启动时校验会话是否仍有效（60 秒内只查一次） */
let meChecked = false;
export async function ensureSession(): Promise<CurrentUser | null> {
  const token = getToken();
  if (!token) {
    clearSession();
    return null;
  }
  const cached = getCachedUser();
  if (cached && meChecked) return cached;
  try {
    const r = await fetch("/api/auth/me", { headers: { "x-auth-token": token } });
    if (!r.ok) {
      clearSession();
      return null;
    }
    const j = (await r.json()) as CurrentUser;
    localStorage.setItem(USER_KEY, JSON.stringify(j));
    meChecked = true;
    return j;
  } catch {
    return cached;
  }
}
