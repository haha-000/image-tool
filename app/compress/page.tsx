"use client";

/**
 * 图片压缩：纯前端（browser-image-compression），不上传服务器，免费不限次。
 * 实时显示压缩前后体积对比 + 节省比例。
 */

import { useRef, useState } from "react";
import Image from "next/image";
import imageCompression from "browser-image-compression";
import ToolShell from "@/components/ToolShell";
import UploadZone from "@/components/UploadZone";
import { downloadBlob, formatBytes, outputName } from "@/lib/image";
import { track } from "@/lib/track";
import { Download, Loader2, RotateCcw } from "lucide-react";

interface CompressResult {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

export default function CompressPage() {
  const [file, setFile] = useState<File | null>(null);
  const [srcUrl, setSrcUrl] = useState<string>("");
  const [quality, setQuality] = useState(70); // 10–100
  const [maxMB, setMaxMB] = useState<string>(""); // 可选目标体积上限
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CompressResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const objectUrlRef = useRef<string>("");

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
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const options: import("browser-image-compression").Options = {
        initialQuality: quality / 100,
        useWebWorker: true,
        fileType: file.type, // 保持原格式
      };
      const limit = parseFloat(maxMB);
      if (!Number.isNaN(limit) && limit > 0) options.maxSizeMB = limit;

      const compressed = await imageCompression(file, options);
      const blob = compressed.size < file.size ? compressed : file; // 极端情况兜底
      const bitmap = await createImageBitmap(blob);
      setResult({
        blob,
        url: URL.createObjectURL(blob),
        width: bitmap.width,
        height: bitmap.height,
      });
      bitmap.close();
      track("tool_used", {
        tool: "compress",
        kbIn: Math.round(file.size / 1024),
        kbOut: Math.round(blob.size / 1024),
      });
    } catch {
      setError("压缩失败，请换一张图片重试");
    } finally {
      setBusy(false);
    }
  };

  const saved = file && result ? Math.max(0, 1 - result.blob.size / file.size) : 0;

  return (
    <ToolShell
      title="图片压缩"
      desc="在浏览器本地完成压缩，图片不上传服务器。拖动滑块调节质量，实时查看体积变化。"
      badge="free"
    >
      {!file ? (
        <UploadZone onFile={pick} hint="支持 JPG / PNG / WebP，最大 20MB" />
      ) : (
        <div className="grid gap-6">
          {/* 原图预览 */}
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm">
              <span className="font-medium">原图预览</span>
              <span className="tnum text-ink-2">
                {formatBytes(file.size)}
                {file.type && ` · ${file.type.replace("image/", "").toUpperCase()}`}
              </span>
            </div>
            <div className="flex max-h-96 items-center justify-center overflow-hidden bg-surface-2 p-4">
              <Image
                src={srcUrl}
                alt="原图预览"
                width={800}
                height={600}
                className="h-auto max-h-80 w-auto max-w-full object-contain"
                unoptimized
              />
            </div>
          </div>

          {/* 参数区 */}
          <div className="rounded-xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">压缩质量</label>
              <span className="tnum text-sm text-accent-strong">{quality}</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="mt-3 w-full accent-[#0e7a5f]"
            />
            <div className="mt-1 flex justify-between text-xs text-ink-3">
              <span>体积更小</span>
              <span>画质更好</span>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <label className="text-sm text-ink-2">目标体积上限（可选）</label>
              <input
                type="number"
                min={0.1}
                step={0.1}
                placeholder="MB"
                value={maxMB}
                onChange={(e) => setMaxMB(e.target.value)}
                className="tnum w-24 rounded-md border border-line bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent"
              />
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={run}
                disabled={busy}
                className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {busy ? "压缩中…" : "开始压缩"}
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

          {/* 结果对比 */}
          {result && (
            <div className="rounded-xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-ink-2">压缩后体积</p>
                  <p className="tnum mt-1 text-2xl font-semibold">
                    {formatBytes(result.blob.size)}
                    {saved > 0.005 && (
                      <span className="ml-2 align-middle text-sm font-medium text-accent">
                        ↓ 节省 {(saved * 100).toFixed(1)}%
                      </span>
                    )}
                  </p>
                </div>
                <p className="tnum text-sm text-ink-2">
                  {result.width} × {result.height} px
                </p>
              </div>

              {/* 体积对比条 */}
              <div className="mt-5 space-y-2">
                <div className="flex items-center gap-3 text-xs text-ink-2">
                  <span className="w-8 shrink-0">原</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full w-full rounded-full bg-ink-3/50" />
                  </div>
                  <span className="tnum w-16 shrink-0 text-right">{formatBytes(file.size)}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-ink-2">
                  <span className="w-8 shrink-0">新</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${Math.max(2, (result.blob.size / file.size) * 100)}%` }}
                    />
                  </div>
                  <span className="tnum w-16 shrink-0 text-right">{formatBytes(result.blob.size)}</span>
                </div>
              </div>

              <button
                onClick={() => {
                  track("download", { tool: "compress" });
                  downloadBlob(result.blob, outputName("compressed", file.type.includes("png") ? "png" : file.type.includes("webp") ? "webp" : "jpg"));
                }}
                className="mt-6 flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
              >
                <Download className="size-4" />
                下载压缩图
              </button>
            </div>
          )}
        </div>
      )}
    </ToolShell>
  );
}
