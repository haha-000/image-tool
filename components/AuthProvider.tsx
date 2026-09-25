"use client";

/**
 * 全局登录状态 + 登录弹窗（单实例挂在 layout，避免每处各自渲染导致位置/层级混乱）。
 *
 * 业务点（AI 工具按钮、付费弹窗）通过 openLogin(原因文案, 成功回调) 拉起，
 * 弹窗顶部展示原因文案，登录成功后自动继续原操作。
 *
 * UX 细节：垂直水平居中、ESC 关闭、点击遮罩关闭、锁定背景滚动、自动聚焦邮箱框。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ShieldCheck, X } from "lucide-react";
import {
  getCachedUser,
  ensureSession,
  loginUser,
  registerUser,
  logoutUser,
  type CurrentUser,
} from "@/lib/auth";
import { track } from "@/lib/track";

interface AuthContextValue {
  user: CurrentUser | null;
  /** 拉起登录弹窗；reason 为业务原因文案（如"AI 功能需登录"），onSuccess 在登录成功后执行 */
  openLogin: (reason?: string, onSuccess?: () => void) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  openLogin: () => {},
  logout: () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [reason, setReason] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const onSuccessRef = useRef<(() => void) | undefined>(undefined);

  const refresh = useCallback(() => {
    setUser(getCachedUser());
    ensureSession().then(setUser);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("tuke-auth-change", refresh);
    return () => window.removeEventListener("tuke-auth-change", refresh);
  }, [refresh]);

  const openLogin = useCallback((msg?: string, onSuccess?: () => void) => {
    onSuccessRef.current = onSuccess;
    setReason(msg || "");
    setMode("login");
    setError("");
    setBusy(false);
    setOpen(true);
  }, []);

  const logout = useCallback(() => {
    logoutUser().then(() => setUser(null));
  }, []);

  /* 弹窗打开时：ESC 关闭 + 锁定背景滚动 */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const r =
      mode === "login" ? await loginUser(email, password) : await registerUser(email, password);
    setBusy(false);
    if (r.ok) {
      track(mode === "login" ? "login_success" : "register_success", { via: "modal" });
      setOpen(false);
      setEmail("");
      setPassword("");
      setUser(getCachedUser());
      const cb = onSuccessRef.current;
      onSuccessRef.current = undefined;
      cb?.(); // 登录成功 → 自动继续登录前的操作
    } else {
      setError(r.error || "操作失败");
    }
  }

  return (
    <AuthContext.Provider value={{ user, openLogin, logout }}>
      {children}

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={mode === "login" ? "登录账号" : "注册账号"}
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-sm rounded-2xl border border-line bg-bg p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold">
                {mode === "login" ? "登录账号" : "注册账号"}
              </h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="关闭"
                className="rounded-md p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* 业务原因文案：为什么此刻需要登录 */}
            {reason && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-accent-soft px-3 py-2.5 text-xs leading-relaxed text-accent-strong">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                <span>{reason}</span>
              </div>
            )}

            <p className="mt-3 text-xs leading-relaxed text-ink-3">
              额度与处理记录将关联到账号，换设备登录也能找回。
            </p>

            <form onSubmit={submit} className="mt-4 space-y-3">
              <input
                type="email"
                required
                autoFocus
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
              {mode === "login" ? "没有账号？30 秒注册一个" : "已有账号？直接登录"}
            </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}
