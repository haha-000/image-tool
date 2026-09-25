"use client";

/**
 * 导航栏右上角登录入口。弹窗由全局 AuthProvider 渲染（单实例、居中、带业务原因文案）。
 */

import { User, LogOut } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

export default function AuthWidget() {
  const { user, openLogin, logout } = useAuth();

  if (user) {
    return (
      <div className="flex items-center gap-1.5">
        <span
          className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-2"
          title={`UID: ${user.uid}`}
        >
          <User className="size-3.5 text-accent" />
          <span className="max-w-28 truncate">{user.email.split("@")[0]}</span>
        </span>
        <button
          onClick={logout}
          className="rounded-full p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          title="退出登录"
        >
          <LogOut className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => openLogin()}
      className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
    >
      <User className="size-3.5" />
      登录 / 注册
    </button>
  );
}
