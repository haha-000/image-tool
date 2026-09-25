"use client";

/**
 * 格式转换：Canvas API 纯前端实现，JPG / PNG / WebP 互转，免费不限次。
 * PNG → JPG 时透明区域填充白底（并在 UI 上明确提示）。
 */

import { useRef, useState } from "react";
import Image from "next/image";
import ToolShell from "@/components/ToolShell";
import UploadZone from "@/components/UploadZone";
import { canvasToBlob, downloadBlob, formatBytes, loadImage, outputName } from "@/lib/image";
import { Download, Loader2, RotateCcw } from "lucide-react";

const TARGETS = [
  { ext: "jpg", mime: "image/jpeg", label: "JPG" },
  { ext: "png", mime: "image/png", label: "PNG" },
  { ext: "webp", mime: "image/webp", label: "WebP" },
] as const;

type TargetExt = (typeof TARGETS)[number]["ext"];

interface SourceInfo {
  file: File;
  url: string;
  width: number;
  height: number;
  ext: string;
}

interface ConvertResult {
  blob: Blob;
  url: string;
}

export default function ConvertPage() {
  const [source, setSource] = useState<SourceInfo | null>(null);
  const [target, setTarget] = useState<TargetExt>("webp");
  const [quality, setQuality] = useState(90);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const objectUrlRef = useRef<string>("");

  const pick = async (file: File) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    try {
      const img = await loadImage(objectUrlRef.current);
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      setSource({
        file,
        url: objectUrlRef.current,
        width: img.naturalWidth,
        height: img.naturalHeight,
        ext: ["jpg", "jpeg"].includes(ext) ? "jpg" : ext || "img",
      });
      setResult(null);
      setError(null);
    } catch {
      setError("图片读取失败，请换一张试试");
    }
  };

  const reset = () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    setSource(null);
    setResult(null);
    setError(null);
  };

  const run = async () => {
    if (!source) return;
    const targetCfg = TARGETS.find((t) => t.ext === target)!;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const img = await loadImage(source.url);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");

      // JPG 不支持透明：先铺白底，避免透明区域变黑
      if (targetCfg.mime === "image/jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0);

      const qualityArg = target === "png" ? undefined : quality / 100;
      const blob = await canvasToBlob(canvas, targetCfg.mime, qualityArg);
      setResult({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setError("转换失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const willFillWhite = target === "jpg" && source && ["png", "webp"].includes(source.ext);

  return (
    <ToolShell
      title="格式转换"
      desc="JPG / PNG / WebP 互转，浏览器本地完成，不限制次数。转 JPG 时透明区域自动填充白底。"
      badge="free"
    >
      {!source ? (
        <UploadZone onFile={pick} hint="支持 JPG / PNG / WebP，最大 20MB" />
      ) : (
        <div className="grid gap-6">
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm">
              <span className="font-medium">原图</span>
              <span className="tnum text-ink-2">
                {source.width} × {source.height} · {formatBytes(source.file.size)} ·{" "}
                {source.ext.toUpperCase()}
              </span>
            </div>
            <div className="flex max-h-80 items-center justify-center overflow-hidden bg-surface-2 p-4">
              <Image
                src={source.url}
                alt="原图预览"
                width={800}
                height={600}
                className="h-auto max-h-64 w-auto max-w-full object-contain"
                unoptimized
              />
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-5">
            <label className="text-sm font-medium">目标格式</label>
            <div className="mt-3 flex gap-2">
              {TARGETS.map((t) => (
                <button
                  key={t.ext}
                  onClick={() => setTarget(t.ext)}
                  className={`rounded-lg border px-5 py-2 text-sm font-medium transition-colors ${
                    target === t.ext
                      ? "border-accent bg-accent-soft text-accent-strong"
                      : "border-line hover:border-line-strong"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {target !== "png" && (
              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-ink-2">输出质量</label>
                  <span className="tnum text-sm text-accent-strong">{quality}</span>
                </div>
                <input
                  type="range"
                  min={30}
                  max={100}
                  step={5}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="mt-2 w-full accent-[#0e7a5f]"
                />
              </div>
            )}

            {willFillWhite && (
              <p className="mt-4 rounded-md bg-amber-soft px-3 py-2 text-xs text-amber">
                当前图片含透明通道：转为 JPG 后透明区域将变为白色
              </p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                onClick={run}
                disabled={busy}
                className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {busy ? "转换中…" : `转换为 ${target.toUpperCase()}`}
              </button>
              <button
                onClick={reset}
                className="flex items-center gap-1.5 rounded-lg border border-line-strong px-4 py-2.5 text-sm transition-colors hover:border-accent hover:text-accent-strong"
              >
                <RotateCcw className="size-4" />
                重新选择
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          </div>

          {result && (
            <div className="rounded-xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-ink-2">转换完成</p>
                  <p className="tnum mt-1 text-lg font-semibold">
                    {target.toUpperCase()} · {formatBytes(result.blob.size)}
                    {result.blob.size < source.file.size && (
                      <span className="ml-2 text-sm font-medium text-accent">
                        比原图小 {((1 - result.blob.size / source.file.size) * 100).toFixed(0)}%
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => downloadBlob(result.blob, outputName("converted", target))}
                  className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
                >
                  <Download className="size-4" />
                  下载 {target.toUpperCase()}
                </button>
              </div>
              <div className="checkerboard mt-4 flex max-h-72 items-center justify-center overflow-hidden rounded-lg p-3">
                <Image
                  src={result.url}
                  alt="转换结果"
                  width={800}
                  height={600}
                  className="h-auto max-h-64 w-auto max-w-full object-contain"
                  unoptimized
                />
              </div>
            </div>
          )}
        </div>
      )}
    </ToolShell>
  );
}
