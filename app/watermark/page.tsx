"use client";

/**
 * AI 去水印（全屏自动识别版）：上传 → 一键处理 → 结果对比。
 * 佐糖全屏去水印-高级 API 自动识别并清除水印/文字/Logo/印章，无需涂抹。
 * 额度逻辑：开始处理前检查（不足弹付费引导），处理成功才扣 1 次；失败不扣。
 */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import ToolShell from "@/components/ToolShell";
import UploadZone from "@/components/UploadZone";
import PaywallModal from "@/components/PaywallModal";
import { requestAi, AiError } from "@/lib/ai-client";
import { tryConsume, refundLast } from "@/lib/quota";
import { downloadDataUrl, formatBytes, outputName } from "@/lib/image";
import { track } from "@/lib/track";
import { Download, Loader2, RotateCcw, Sparkles } from "lucide-react";

export default function WatermarkPage() {
  const [file, setFile] = useState<File | null>(null);
  const [srcUrl, setSrcUrl] = useState<string>("");
  const objectUrlRef = useRef<string>("");

  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0); // 0 idle / 1 上传 / 2 AI 识别清除 / 3 生成
  const [result, setResult] = useState<string | null>(null);
  const [resultExt, setResultExt] = useState<"png" | "jpg">("png");
  const [error, setError] = useState<string | null>(null);
  const [paywall, setPaywall] = useState(false);

  // 对比滑块
  const [split, setSplit] = useState(50);
  const [dragging, setDragging] = useState(false);
  const compareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!busy) return setStage(0);
    const t1 = setTimeout(() => setStage(1), 0);
    const t2 = setTimeout(() => setStage(2), 2500);
    const t3 = setTimeout(() => setStage(3), 30_000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [busy]);

  const STAGE_TEXT = [
    "准备中…",
    "正在上传图片…",
    "AI 正在全屏识别并清除水印…",
    "AI 处理较慢，请再等一会儿…",
  ];

  const pick = (f: File) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(f);
    setFile(f);
    setSrcUrl(objectUrlRef.current);
    setResult(null);
    setError(null);
  };

  const reset = () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    setFile(null);
    setSrcUrl("");
    setResult(null);
    setError(null);
  };

  /* ── 提交 AI 处理 ── */
  const run = async () => {
    if (!file || busy) return;

    if (!tryConsume().ok) {
      setPaywall(true);
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await requestAi("watermark", form);
      setResult(res.image);
      setResultExt(res.image.startsWith("data:image/jpeg") ? "jpg" : "png");
      setSplit(50);
      track("ai_success", { tool: "watermark", kb: Math.round(file.size / 1024) });
    } catch (err) {
      refundLast(); // 处理失败不扣额度
      setError(err instanceof AiError ? err.message : "服务繁忙，请稍后再试");
      track("ai_fail", {
        tool: "watermark",
        reason: err instanceof AiError ? err.message.slice(0, 100) : "unknown",
      });
    } finally {
      setBusy(false);
    }
  };

  /* ── 对比滑块拖动 ── */
  const onCompareMove = (clientX: number) => {
    const el = compareRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSplit(Math.min(96, Math.max(4, pct)));
  };

  return (
    <ToolShell
      title="AI 去水印"
      desc="上传图片，AI 自动识别并清除水印、文字、Logo 与印章，智能填充修复画面。每天 3 次免费额度，处理失败不扣次数。"
      badge="ai"
    >
      {!file ? (
        <UploadZone onFile={pick} hint="支持 JPG / PNG / WebP，建议 5000×5000 以内" />
      ) : result ? (
        /* ── 结果对比视图 ── */
        <div className="grid gap-5">
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm">
              <span className="font-medium">处理结果 · 左右拖动对比</span>
              <span className="text-xs text-ink-3">左：原图 / 右：去水印后</span>
            </div>
            <div
              ref={compareRef}
              className="relative select-none"
              onPointerDown={(e) => {
                setDragging(true);
                onCompareMove(e.clientX);
              }}
              onPointerMove={(e) => dragging && onCompareMove(e.clientX)}
              onPointerUp={() => setDragging(false)}
              onPointerLeave={() => setDragging(false)}
            >
              <Image
                src={result}
                alt="去水印结果"
                width={1200}
                height={800}
                className="block h-auto w-full"
                unoptimized
              />
              <div
                className="pointer-events-none absolute inset-0 overflow-hidden"
                style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
              >
                <Image
                  src={srcUrl}
                  alt="原图"
                  width={1200}
                  height={800}
                  className="block h-auto w-full"
                  unoptimized
                />
              </div>
              {/* 分割线手柄 */}
              <div
                className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
                style={{ left: `${split}%` }}
              >
                <span className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white text-xs font-bold text-ink-2 shadow">
                  ↔
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                track("download", { tool: "watermark" });
                downloadDataUrl(result, outputName("watermark-removed", resultExt));
              }}
              className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
            >
              <Download className="size-4" />
              下载去水印图
            </button>
            <button
              onClick={reset}
              className="flex items-center gap-1.5 rounded-lg border border-line-strong px-4 py-2.5 text-sm transition-colors hover:border-accent hover:text-accent-strong"
            >
              <RotateCcw className="size-4" />
              处理另一张
            </button>
          </div>
        </div>
      ) : (
        /* ── 上传预览 + 一键处理 ── */
        <div className="grid gap-6">
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm">
              <span className="font-medium">原图</span>
              <span className="text-xs text-ink-3">{formatBytes(file.size)}</span>
            </div>
            <div className="flex max-h-80 items-center justify-center overflow-hidden bg-surface-2 p-4">
              <Image
                src={srcUrl}
                alt="原图预览"
                width={800}
                height={600}
                className="h-auto max-h-64 w-auto max-w-full object-contain"
                unoptimized
              />
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-5">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={run}
                disabled={busy}
                className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {busy ? STAGE_TEXT[stage] : "一键 AI 去水印（消耗 1 次额度）"}
              </button>
              <button
                onClick={reset}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-line-strong px-4 py-2.5 text-sm transition-colors hover:border-accent hover:text-accent-strong disabled:opacity-40"
              >
                <RotateCcw className="size-4" />
                换图
              </button>
            </div>
            {!busy && (
              <p className="mt-3 text-xs text-ink-3">
                AI 自动识别全图中的水印、文字、Logo 和印章，无需手动涂抹；复杂图片处理约需 20–60 秒
              </p>
            )}
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          </div>
        </div>
      )}

      <PaywallModal open={paywall} onClose={() => setPaywall(false)} />
    </ToolShell>
  );
}
