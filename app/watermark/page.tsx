"use client";

/**
 * AI 去水印：上传 → Canvas 涂抹标记水印区域 → 提交后端代理 → 结果对比。
 * 额度逻辑：开始处理前检查（不足弹付费引导），处理成功才扣 1 次；失败不扣。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import ToolShell from "@/components/ToolShell";
import UploadZone from "@/components/UploadZone";
import PaywallModal from "@/components/PaywallModal";
import { requestAi, AiError } from "@/lib/ai-client";
import { tryConsume, refundLast } from "@/lib/quota";
import { downloadDataUrl, formatBytes, loadImage, outputName } from "@/lib/image";
import { Download, Loader2, RotateCcw, Brush, Eraser } from "lucide-react";

/** 涂抹笔触（原图坐标系） */
type Stroke = Array<{ x: number; y: number }>;

export default function WatermarkPage() {
  // 原图状态
  const [file, setFile] = useState<File | null>(null);
  const [srcUrl, setSrcUrl] = useState<string>("");
  const [srcSize, setSrcSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const objectUrlRef = useRef<string>("");

  // 涂抹状态
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [brushSize, setBrushSize] = useState(36);
  const drawingRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 处理状态
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0); // 0 idle / 1 上传 / 2 AI 修复 / 3 生成
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paywall, setPaywall] = useState(false);

  // 对比滑块
  const [split, setSplit] = useState(50);
  const [dragging, setDragging] = useState(false);
  const compareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!busy) return setStage(0);
    const t1 = setTimeout(() => setStage(1), 0);
    const t2 = setTimeout(() => setStage(2), 1600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [busy]);

  const STAGE_TEXT = ["准备中…", "正在上传图片…", "AI 正在修复涂抹区域…", "正在生成结果…"];

  const pick = (f: File) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(f);
    setFile(f);
    setSrcUrl(objectUrlRef.current);
    setStrokes([]);
    setResult(null);
    setError(null);
    loadImage(objectUrlRef.current).then((img) =>
      setSrcSize({ w: img.naturalWidth, h: img.naturalHeight })
    );
  };

  const reset = () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    setFile(null);
    setSrcUrl("");
    setStrokes([]);
    setResult(null);
    setError(null);
  };

  /* ── 涂抹绘制（显示层：红色半透明笔刷） ── */
  const redraw = useCallback(
    (all: Stroke[]) => {
      const canvas = canvasRef.current;
      if (!canvas || !srcSize.w) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "rgba(220, 60, 40, 0.55)";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = brushSize;
      for (const s of all) {
        if (s.length < 2) {
          if (s.length === 1) {
            ctx.beginPath();
            ctx.arc(s[0].x, s[0].y, brushSize / 2, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(220, 60, 40, 0.55)";
            ctx.fill();
          }
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(s[0].x, s[0].y);
        for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y);
        ctx.stroke();
      }
    },
    [brushSize, srcSize.w]
  );

  useEffect(() => {
    redraw(strokes);
  }, [strokes, redraw]);

  /** 屏幕坐标 → 画布坐标（画布分辨率 = 原图尺寸，CSS 自适应缩放） */
  const toCanvasPos = (e: React.PointerEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startDraw = (e: React.PointerEvent) => {
    if (result) return; // 已出结果，禁止再涂
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    setStrokes((prev) => [...prev, [toCanvasPos(e)]]);
  };
  const moveDraw = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const p = toCanvasPos(e);
    setStrokes((prev) => {
      const next = [...prev];
      next[next.length - 1] = [...next[next.length - 1], p];
      return next;
    });
  };
  const endDraw = () => {
    drawingRef.current = false;
  };

  /** 生成上游 inpaint 掩码：黑底白笔触 PNG */
  const buildMask = (): Promise<Blob> => {
    const canvas = document.createElement("canvas");
    canvas.width = srcSize.w;
    canvas.height = srcSize.h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#fff";
    ctx.fillStyle = "#fff";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = brushSize;
    for (const s of strokes) {
      if (s.length === 1) {
        ctx.beginPath();
        ctx.arc(s[0].x, s[0].y, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y);
      ctx.stroke();
    }
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("mask"))), "image/png")
    );
  };

  /* ── 提交 AI 处理 ── */
  const run = async () => {
    if (!file || strokes.length === 0) return;

    // 额度检查：不足则弹付费引导，本次不消耗
    if (!tryConsume().ok) {
      setPaywall(true);
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const mask = await buildMask();
      const form = new FormData();
      form.append("image", file);
      form.append("mask", new File([mask], "mask.png", { type: "image/png" }));

      const res = await requestAi("watermark", form);
      setResult(res.image);
      setSplit(50);
    } catch (err) {
      // 处理失败不扣额度：回退刚消耗的次数
      refundLast();
      setError(err instanceof AiError ? err.message : "服务繁忙，请稍后再试");
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
      desc="上传图片后用笔刷涂抹水印区域，AI 自动修复画面。每天 3 次免费额度，处理失败不扣次数。"
      badge="ai"
    >
      {!file ? (
        <UploadZone onFile={pick} hint="支持 JPG / PNG / WebP，建议 5000×5000 以内" />
      ) : result ? (
        /* ── 结果对比视图 ── */
        <div className="grid gap-5">
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm">
              <span className="font-medium">修复结果 · 左右拖动对比</span>
              <span className="text-xs text-ink-3">左：原图 / 右：修复后</span>
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
                alt="修复结果"
                width={srcSize.w || 1200}
                height={srcSize.h || 800}
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
                  width={srcSize.w || 1200}
                  height={srcSize.h || 800}
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
              onClick={() => downloadDataUrl(result, outputName("watermark-removed", "png"))}
              className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
            >
              <Download className="size-4" />
              下载修复图
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
        /* ── 涂抹编辑视图 ── */
        <div className="grid gap-6">
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-sm">
              <span className="font-medium">涂抹水印区域</span>
              <span className="tnum text-xs text-ink-3">
                {srcSize.w} × {srcSize.h} · {formatBytes(file.size)}
              </span>
            </div>
            <div className="relative bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={srcUrl}
                alt="待处理图片"
                className="block max-h-[26rem] w-full object-contain"
                draggable={false}
              />
              <canvas
                ref={canvasRef}
                width={srcSize.w || 1}
                height={srcSize.h || 1}
                className="brush-canvas absolute inset-0 h-full w-full"
                onPointerDown={startDraw}
                onPointerMove={moveDraw}
                onPointerUp={endDraw}
                onPointerCancel={endDraw}
              />
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Brush className="size-4 text-ink-2" />
                笔刷大小
              </label>
              <span className="tnum text-sm text-accent-strong">{brushSize}px</span>
            </div>
            <input
              type="range"
              min={12}
              max={90}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="mt-3 w-full accent-[#0e7a5f]"
            />

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={run}
                disabled={busy || strokes.length === 0}
                className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {busy ? STAGE_TEXT[stage] : "开始 AI 修复（消耗 1 次额度）"}
              </button>
              <button
                onClick={() => setStrokes([])}
                disabled={strokes.length === 0 || busy}
                className="flex items-center gap-1.5 rounded-lg border border-line-strong px-4 py-2.5 text-sm transition-colors hover:border-accent hover:text-accent-strong disabled:opacity-40"
              >
                <Eraser className="size-4" />
                清除涂抹
              </button>
              <button
                onClick={reset}
                className="flex items-center gap-1.5 rounded-lg border border-line-strong px-4 py-2.5 text-sm transition-colors hover:border-accent hover:text-accent-strong"
              >
                <RotateCcw className="size-4" />
                换图
              </button>
            </div>

            {strokes.length === 0 && !busy && (
              <p className="mt-3 text-xs text-ink-3">在图片上按住拖动，把水印涂成红色再开始修复</p>
            )}
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          </div>
        </div>
      )}

      <PaywallModal open={paywall} onClose={() => setPaywall(false)} />
    </ToolShell>
  );
}
