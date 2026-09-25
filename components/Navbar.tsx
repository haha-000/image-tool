"use client";

/** 顶部导航：品牌 + 工具入口 + 右上角额度徽章（今日剩余 AI 次数） */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coins } from "lucide-react";
import { useQuota } from "@/components/QuotaProvider";
import { DAILY_FREE_LIMIT, remainingToday } from "@/lib/quota";

const TOOLS = [
  { href: "/compress", label: "压缩" },
  { href: "/convert", label: "转换" },
  { href: "/watermark", label: "去水印" },
  { href: "/matting", label: "抠图" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { quota } = useQuota();

  const remaining = quota ? remainingToday(quota) : null;
  const isMember = quota?.memberUntil ? quota.memberUntil > Date.now() : false;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          {/* 品牌方章：单色翡翠绿，克制 */}
          <span className="flex size-7 items-center justify-center rounded-md bg-accent text-sm font-bold text-white">
            图
          </span>
          <span className="text-[15px] font-semibold tracking-tight">图客工坊</span>
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto text-sm text-ink-2">
          {TOOLS.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`shrink-0 rounded-md px-3 py-1.5 transition-colors ${
                  active
                    ? "bg-accent-soft font-medium text-accent-strong"
                    : "hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        {/* 额度徽章：透明、有掌控感 */}
        <div
          className="hidden shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-2 sm:flex"
          title="每天 3 次免费 AI 处理，次日自动重置"
        >
          <Coins className="size-3.5 text-amber" />
          <span className="tnum">
            今日剩余 AI 次数：
            {remaining === null ? "…" : `${remaining}/${DAILY_FREE_LIMIT}`}
          </span>
          {quota && quota.credits > 0 && (
            <span className="tnum text-amber">· 积分 {quota.credits}</span>
          )}
          {isMember && <span className="text-accent">· 会员</span>}
        </div>
      </div>
    </header>
  );
}
