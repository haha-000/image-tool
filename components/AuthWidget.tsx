"use client";

/**
 * 导航栏登录组件：未登录显示「登录」，登录后显示邮箱 + 退出。
 * 弹窗内含注册/登录双模式（邮箱+密码）。
 */

import { useEffect, useState, useCallback } from "react";
import { User, X, LogOut } from "lucide-react";
import {
  registerUser,
  loginUser,
  logoutUser,
  ensureSession,
  getCachedUser,
  type CurrentUser,
} from "@/lib/auth";

type Mode = "login" | "register";

export default function AuthWidget() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    setUser(getCachedUser());
    ensureSession().then(setUser);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("tuke-auth-change", refresh);
    return () => window.removeEventListener("tuke-auth-change", refresh);
  }, [refresh]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const r = mode === "login" ? await loginUser(email, password) : await registerUser(email, password);
    setBusy(false);
    if (r.ok) {
      setOpen(false);
      setEmail("");
      setPassword("");
    } else {
      setError(r.error || "操作失败");
    }
  }

  async function handleLogout() {
    await logoutUser();
    setUser(null);
  }

  return (
    <>
      {user ? (
        <div className="flex items-center gap-1.5">
          <span
            className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-2"
            title={`UID: ${user.uid}`}
          >
            <User className="size-3.5 text-accent" />
            <span className="max-w-28 truncate">{user.email.split("@")[0]}</span>
          </span>
          <button
            onClick={handleLogout}
            className="rounded-full p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            title="退出登录"
          >
            <LogOut className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          <User className="size-3.5" />
          登录
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-line bg-bg p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {mode === "login" ? "登录账号" : "注册账号"}
              </h2>
              <button onClick={() => setOpen(false)} className="rounded-md p-1 text-ink-3 hover:bg-surface-2">
                <X className="size-4" />
              </button>
            </div>

            <p className="mb-4 text-xs leading-relaxed text-ink-3">
              注册后你的处理记录和额度将关联到账号邮箱，便于我们为你提供售后与数据恢复。
            </p>

            <form onSubmit={submit} className="space-y-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="邮箱"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent"
                autoComplete="email"
              />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码（至少 8 位）"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />

              {error && <p className="text-xs text-red-500">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "请稍候…" : mode === "login" ? "登录" : "注册并登录"}
              </button>
            </form>

            <button
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
              className="mt-4 w-full text-center text-xs text-ink-3 transition-colors hover:text-accent"
            >
              {mode === "login" ? "没有账号？注册一个" : "已有账号？直接登录"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
