"use client";

/**
 * AI 抠图：上传 → 提交后端代理 → 透明背景 PNG 预览（棋盘格底）→ 下载。
 * 额度逻辑与去水印一致：开始前检查，成功扣 1 次，失败退款。
 */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import ToolShell from "@/components/ToolShell";
import UploadZone from "@/components/UploadZone";
import PaywallModal from "@/components/PaywallModal";
import { requestAi, AiError } from "@/lib/ai-client";
import { tryConsume, refundLast } from "@/lib/quota";
import { downloadDataUrl, formatBytes, outputName } from "@/lib/image";
import { Download, Loader2, RotateCcw } from "lucide-react";

export default function MattingPage() {
  const [file, setFile] = useState<File | null>(null);
  const [srcUrl, setSrcUrl] = useState<string>("");
  const objectUrlRef = useRef<string>("");

  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0); // 0 idle / 1 上传 / 2 识别主体 / 3 生成
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paywall, setPaywall] = useState(false);

  useEffect(() => {
    if (!busy) return setStage(0);
    const t1 = setTimeout(() => setStage(1), 0);
    const t2 = setTimeout(() => setStage(2), 1600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [busy]);

  const STAGE_TEXT = ["准备中…", "正在上传图片…", "AI 正在识别图片主体…", "正在生成透明背景…"];

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

  const run = async () => {
    if (!file) return;

    // 额度检查：不足则弹付费引导
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
      const res = await requestAi("matting", form);
      setResult(res.image);
    } catch (err) {
      refundLast(); // 失败不扣额度
      setError(err instanceof AiError ? err.message : "服务繁忙，请稍后再试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolShell
      title="AI 抠图"
      desc="自动识别图片主体（人物、商品、动物等），生成透明背景 PNG。每天 3 次免费额度。"
      badge="ai"
    >
      {!file ? (
        <UploadZone onFile={pick} hint="支持 JPG / PNG / WebP，建议主体清晰的图片" />
      ) : result ? (
        <div className="grid gap-5">
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm">
              <span className="font-medium">抠图结果</span>
              <span className="text-xs text-ink-3">透明背景 · 棋盘格仅为预览效果</span>
            </div>
            <div className="checkerboard flex max-h-[28rem] items-center justify-center overflow-hidden p-4">
              <Image
                src={result}
                alt="抠图结果"
                width={900}
                height={700}
                className="h-auto max-h-[26rem] w-auto max-w-full object-contain"
                unoptimized
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => downloadDataUrl(result, outputName("matted", "png"))}
              className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
            >
              <Download className="size-4" />
              下载透明 PNG
            </button>
            <button
              onClick={reset}
              className="flex items-center gap-1.5 rounded-lg border border-line-strong px-4 py-2.5 text-sm transition-colors hover:border-accent hover:text-accent-strong"
            >
              <RotateCcw className="size-4" />
              抠另一张
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6">
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm">
              <span className="font-medium">原图</span>
              <span className="tnum text-xs text-ink-3">{formatBytes(file.size)}</span>
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
                className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {busy ? STAGE_TEXT[stage] : "开始 AI 抠图（消耗 1 次额度）"}
              </button>
              <button
                onClick={reset}
                className="flex items-center gap-1.5 rounded-lg border border-line-strong px-4 py-2.5 text-sm transition-colors hover:border-accent hover:text-accent-strong"
              >
                <RotateCcw className="size-4" />
                换图
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          </div>
        </div>
      )}

      <PaywallModal open={paywall} onClose={() => setPaywall(false)} />
    </ToolShell>
  );
}
