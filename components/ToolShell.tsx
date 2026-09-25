/** 工具页统一外壳：标题 + 徽章 + 说明 */

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface ToolShellProps {
  title: string;
  desc: string;
  badge: "free" | "ai";
  children: ReactNode;
}

export default function ToolShell({ title, desc, badge, children }: ToolShellProps) {
  return (
    <div className="pt-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-ink-3 transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        返回首页
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {badge === "free" ? (
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-strong">
            免费 · 不限次
          </span>
        ) : (
          <span className="rounded-full bg-amber-soft px-2.5 py-0.5 text-xs font-medium text-amber">
            AI 处理 · 消耗额度
          </span>
        )}
      </div>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-2">{desc}</p>

      <div className="mt-8">{children}</div>
    </div>
  );
}
