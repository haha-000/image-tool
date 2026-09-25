"use client";

/**
 * 付费引导弹窗：今日免费额度用完时触发。
 * 原则（来自 MVP 文档）：不强迫付费 —— 必须有清晰的关闭按钮，
 * 处理已完成时提供"仅下载当前单张（免费）"选项。
 * MVP 阶段充值走"联系客服 + 后台改额度"，接支付后再替换占位逻辑。
 */

import { useState } from "react";
import { Coins, Crown, X } from "lucide-react";
import { activateMember, grantCredits } from "@/lib/quota";

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
  /** 若当前已有处理好的结果，提供免费下载单张的出口 */
  onFreeDownload?: () => void;
}

const PLANS = [
  {
    id: "credits",
    icon: Coins,
    name: "单次充值",
    price: "¥9.9",
    desc: "20 积分，用完为止",
    grant: () => grantCredits(20),
  },
  {
    id: "member",
    icon: Crown,
    name: "体验会员",
    price: "¥29",
    desc: "7 天有效，每天额外赠送 10 积分",
    grant: () => activateMember(7),
  },
] as const;

export default function PaywallModal({ open, onClose, onFreeDownload }: PaywallModalProps) {
  const [paid, setPaid] = useState(false);

  if (!open) return null;

  const handleChoose = (plan: (typeof PLANS)[number]) => {
    // MVP：模拟「客服确认到账 → 后台加额度」。正式接入支付后删除本段，改为拉起支付。
    plan.grant();
    setPaid(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="充值引导"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">今日免费额度已用完</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="rounded-md p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X className="size-5" />
          </button>
        </div>

        {!paid ? (
          <>
            <p className="mt-1.5 text-sm text-ink-2">
              充值积分继续处理，压缩与格式转换仍然完全免费。
            </p>

            <div className="mt-5 grid gap-3">
              {PLANS.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => handleChoose(plan)}
                  className="flex items-center justify-between rounded-lg border border-line px-4 py-3.5 text-left transition-all hover:border-accent hover:bg-accent-soft"
                >
                  <span className="flex items-center gap-3">
                    <plan.icon className="size-5 text-accent" />
                    <span>
                      <span className="block text-sm font-medium">{plan.name}</span>
                      <span className="block text-xs text-ink-2">{plan.desc}</span>
                    </span>
                  </span>
                  <span className="tnum text-lg font-semibold text-accent-strong">
                    {plan.price}
                  </span>
                </button>
              ))}
            </div>

            <p className="mt-4 text-center text-xs text-ink-3">
              MVP 阶段为演示结算，正式支付接入前请勿真实付款
            </p>
          </>
        ) : (
          <div className="mt-4 rounded-lg bg-accent-soft px-4 py-5 text-center">
            <p className="text-sm font-medium text-accent-strong">额度已到账（演示）</p>
            <p className="mt-1 text-xs text-ink-2">
              正式版：跳转微信 / 支付宝支付，到账后自动加额度
            </p>
            <button
              onClick={onClose}
              className="mt-4 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
            >
              继续处理
            </button>
          </div>
        )}

        {onFreeDownload && (
          <button
            onClick={onFreeDownload}
            className="mt-4 w-full text-center text-sm text-ink-2 underline-offset-4 hover:text-ink hover:underline"
          >
            仅下载当前单张（免费）
          </button>
        )}
      </div>
    </div>
  );
}
