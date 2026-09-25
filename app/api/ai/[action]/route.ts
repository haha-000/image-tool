/**
 * AI 能力统一后端代理（watermark / matting）— 佐糖 PicWish 适配版
 *
 * 上游规格（佐糖官方 API 文档）：
 *   鉴权     X-API-KEY 请求头
 *   去水印   POST /api/tasks/visual/inpaint       （mask_file：白色 = 移除区域）
 *   抠图     POST /api/tasks/visual/segmentation  （输出透明 PNG）
 *   任务模式 异步：创建拿 task_id → 每 ~1.2s 轮询 → state=1 完成
 *   结果     data.image（return_type=2 时为 base64；URL 仅 1 小时有效）
 *
 * 三个工程决策：
 * 1. 异步任务而非 sync=1 —— 官方推荐方式，高并发下成功率更高，超时完全可控；
 * 2. return_type=2 优先拿 base64 —— 佐糖结果 URL 只有 1 小时有效期，
 *    base64 转成 dataURL 后前端永久可用（用户隔天下载也不失效）；
 * 3. 前端统一字段（image / mask）在本层映射为佐糖字段（image_file / mask_file），
 *    前端永远不感知服务商细节 —— 以后换供应商只改这一个文件。
 *
 * 安全设计：
 * 1. API Key 只存在于服务端环境变量，浏览器永远拿不到；
 * 2. 单 IP 每日限流防刷（内存级，serverless 多实例下是近似值，生产建议 Upstash Redis）；
 * 3. 上游异常统一降级为「服务繁忙」，不向客户端透出内部细节，详细信息只进服务端日志。
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_ACTIONS = new Set(["watermark", "matting"]);

/** 佐糖任务端点（创建与轮询同路径，轮询在尾部追加 /{task_id}） */
const TASKS: Record<string, { createPath: string }> = {
  watermark: { createPath: "/api/tasks/visual/inpaint" },
  matting: { createPath: "/api/tasks/visual/segmentation" },
};

/* ── 超时预算 ── */
const CREATE_TIMEOUT_MS = 30_000; // 创建任务（含图片上传）
const POLL_INTERVAL_MS = 1_200; // 轮询间隔（官方建议 1s，略放宽）
const POLL_BUDGET_MS = 42_000; // 轮询总预算（官方上限 inpaint 30s / segmentation 60s）
const POLL_REQ_TIMEOUT_MS = 10_000; // 单次轮询请求超时
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 佐糖上限 20MB / 4096×4096

/* ── 单 IP 每日限流 ── */
const IP_DAILY_LIMIT = 50;
const ipHits = new Map<string, { date: string; count: number }>();

function rateLimited(ip: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const rec = ipHits.get(ip);
  if (!rec || rec.date !== today) {
    ipHits.set(ip, { date: today, count: 1 });
    return false;
  }
  rec.count += 1;
  return rec.count > IP_DAILY_LIMIT;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 上游结果字段 → 前端可用的图片地址（dataURL 或 https URL） */
function normalizeImage(field: string): string {
  if (field.startsWith("data:")) return field;
  if (/^https?:\/\//.test(field)) return field; // 兜底：上游忽略 return_type 时返回 URL
  // 裸 base64：按魔数嗅探真实 MIME（佐糖 inpaint 返回 JPEG、segmentation 返回 PNG，
  // 标错 MIME 会导致下载文件扩展名与内容不符）
  const mime = field.startsWith("iVBOR")
    ? "image/png"
    : field.startsWith("/9j/")
      ? "image/jpeg"
      : field.startsWith("R0lGOD")
        ? "image/gif"
        : field.startsWith("UklGR")
          ? "image/webp"
          : "image/png";
  return `data:${mime};base64,${field}`;
}

const busy = (msg = "服务繁忙，请稍后再试") =>
  NextResponse.json({ error: msg }, { status: 502 });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params;

  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: "不支持的操作" }, { status: 404 });
  }

  /* ── 简易防刷 ── */
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "今日调用次数过多，请明天再来" }, { status: 429 });
  }

  /* ── 配置检查 ── */
  const apiKey = process.env.AI_API_KEY;
  const apiBase = (process.env.AI_API_BASE || "https://techsz.aoscdn.com").replace(
    /\/$/,
    ""
  );
  if (!apiKey) {
    return NextResponse.json({ error: "AI 服务暂未开通，请稍后再试" }, { status: 503 });
  }
  const authHeaders = { "X-API-KEY": apiKey };

  /* ── 接收前端表单 ── */
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const image = form.get("image");
  const mask = form.get("mask");
  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.json({ error: "缺少图片" }, { status: 400 });
  }
  if (image.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "图片过大（上限 20MB），请先在本站压缩后再试" },
      { status: 413 }
    );
  }

  /* ── 映射为佐糖字段 ── */
  const upstream = new FormData();
  upstream.append("image_file", image, image.name || "image.png");
  if (mask instanceof File && mask.size > 0) {
    upstream.append("mask_file", mask, "mask.png"); // 黑底白区 = 要移除的区域
  }
  upstream.append("sync", "0"); // 异步任务模式
  upstream.append("return_type", "2"); // 结果用 base64 返回（URL 仅 1 小时有效）
  if (action === "matting") {
    upstream.append("format", "png"); // 透明背景
    upstream.append("output_type", "2"); // 只要结果图，不要蒙版
    upstream.append("crop", "0"); // 保持原始尺寸
  }

  /* ── 1. 创建任务 ── */
  const createPath = TASKS[action].createPath;
  let taskId: string | undefined;
  try {
    const res = await fetch(`${apiBase}${createPath}`, {
      method: "POST",
      headers: authHeaders,
      body: upstream,
      signal: AbortSignal.timeout(CREATE_TIMEOUT_MS),
    });

    const json = (await res.json().catch(() => null)) as
      | { data?: { task_id?: string }; message?: string }
      | null;

    if (!res.ok) {
      console.error(`[ai/${action}] create failed: HTTP ${res.status} ${json?.message ?? ""}`);
      // 401/403 = Key 无效或未开通，与未配置 Key 同一话术，方便用户识别配置问题
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json(
          { error: "AI 服务暂未开通，请稍后再试" },
          { status: 503 }
        );
      }
      return busy();
    }
    taskId = json?.data?.task_id;
    if (!taskId) {
      console.error(`[ai/${action}] create ok but no task_id: ${JSON.stringify(json)}`);
      return busy();
    }
  } catch (err) {
    console.error(`[ai/${action}] create error:`, err instanceof Error ? err.message : err);
    return busy();
  }

  /* ── 2. 轮询结果 ── */
  const deadline = Date.now() + POLL_BUDGET_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    let poll: {
      data?: { state?: number; image?: string; file?: string };
      message?: string;
    } | null;
    try {
      const r = await fetch(`${apiBase}${createPath}/${taskId}`, {
        headers: authHeaders,
        signal: AbortSignal.timeout(POLL_REQ_TIMEOUT_MS),
      });
      poll = (await r.json().catch(() => null)) as typeof poll;
    } catch {
      continue; // 单次网络抖动不致命，继续下一轮
    }

    const state = poll?.data?.state;
    const imageField = poll?.data?.image || poll?.data?.file;

    if (state === 1 && imageField) {
      return NextResponse.json({ image: normalizeImage(imageField) });
    }
    if (typeof state === "number" && state < 0) {
      console.error(`[ai/${action}] task ${taskId} failed: state=${state} ${poll?.message ?? ""}`);
      // -7 = 无效图片；其余为上游处理失败。前端已有失败退款逻辑，统一降级话术。
      return busy(state === -7 ? "图片无法识别，请更换图片后重试" : undefined);
    }
    // state > 1（或未返回）= 处理中，继续轮询
  }

  console.error(`[ai/${action}] task ${taskId} polling timeout`);
  return NextResponse.json({ error: "处理超时，请稍后再试" }, { status: 504 });
}
