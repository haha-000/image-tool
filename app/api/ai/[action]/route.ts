/**
 * AI 能力统一后端代理（watermark / matting）— 佐糖 PicWish 适配版 · 两段式任务架构
 *
 * 上游规格（佐糖官方 API 文档）：
 *   鉴权     X-API-KEY 请求头
 *   去水印   POST /api/tasks/visual/advanced/watermark-remove（全屏去水印-高级：AI 自动识别，无需涂抹）
 *   抠图     POST /api/tasks/visual/segmentation（输出透明 PNG）
 *   任务模式 异步：创建拿 task_id → 轮询 GET {path}/{task_id} → state=1 完成
 *
 * 为什么是两段式（创建 + 前端轮询）而不是单个函数等到出结果：
 *   全屏去水印官方示例耗时 53s+，单次 serverless 函数 60s 上限随时会被打穿；
 *   拆开后每次函数调用只做一次短上游请求，长任务在浏览器侧轮询，永不超时。
 *
 * 运营日志：所有任务创建/成功/失败都以结构化 JSON 写入服务端日志，
 *   在 Vercel 控制台可按 "ai_task" 过滤直接统计任务量与失败率（见 OPERATIONS.md）。
 *
 * 安全设计（不变）：
 *   1. API Key 只存在于服务端环境变量；
 *   2. 创建接口单 IP 每日限流防刷；
 *   3. 上游异常统一降级话术，细节只进服务端日志。
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySession, recordEvent } from "@/lib/auth-server";
import { kvEnabled } from "@/lib/upstash";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_ACTIONS = new Set(["watermark", "matting"]);

/** 佐糖任务端点（创建与轮询同路径，轮询在尾部追加 /{task_id}） */
const TASKS: Record<string, { createPath: string; label: string }> = {
  watermark: { createPath: "/api/tasks/visual/advanced/watermark-remove", label: "去水印" },
  matting: { createPath: "/api/tasks/visual/segmentation", label: "抠图" },
};

const CREATE_TIMEOUT_MS = 30_000; // 创建任务（含图片上传）
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 佐糖上限 50MB，站点收紧到 20MB
const RESULT_FETCH_TIMEOUT_MS = 20_000; // 下载上游结果 URL

/* ── 单 IP 每日限流（仅创建接口计数） ── */
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

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** 结构化运营日志：Vercel 控制台按 "ai_task" / "ai_task_fail" 过滤即可统计；KV 配置时同步落库（关联 uid 主键） */
function opsLog(
  event: string,
  fields: Record<string, string | number | undefined | null>
) {
  console.log(JSON.stringify({ t: event, ts: new Date().toISOString(), ...fields }));
  if (kvEnabled() && (event === "ai_task_create" || event === "ai_task_done" || event === "ai_task_fail")) {
    // fire-and-forget：落库失败不影响响应
    resolveUidAndRecord(event, fields).catch(() => {});
  }
}

/** token → uid，把 AI 任务事件写入全局流 + 单用户轨迹 */
async function resolveUidAndRecord(
  event: string,
  fields: Record<string, string | number | undefined | null>
): Promise<void> {
  const token = String(fields.token || "") || null;
  const user = token ? await verifySession(token) : null;
  const props: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k === "token" || k === "ip") continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") props[k] = v;
  }
  await recordEvent({
    event,
    uid: user?.uid,
    anonId: user ? undefined : String(fields.userId || "anon").slice(0, 64),
    ip: String(fields.ip || "unknown"),
    ua: "ai-api",
    props,
  });
}

/** 裸 base64 → dataURL（按魔数嗅探真实 MIME，避免下载扩展名与内容不符） */
function base64ToDataUrl(field: string): string {
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

/** 上游结果 → 前端可直接展示/下载的 dataURL。URL 结果在服务端转存 base64（佐糖 URL 仅 1 小时有效） */
async function toDataUrl(field: string): Promise<string> {
  if (field.startsWith("data:")) return field;
  if (/^https?:\/\//.test(field)) {
    const r = await fetch(field, { signal: AbortSignal.timeout(RESULT_FETCH_TIMEOUT_MS) });
    if (!r.ok) throw new Error(`result fetch failed: HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const mime = r.headers.get("content-type")?.split(";")[0] || "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  }
  return base64ToDataUrl(field);
}

const busy = (msg = "服务繁忙，请稍后再试") =>
  NextResponse.json({ error: msg }, { status: 502 });

/* ═══════════ 第一段：创建任务（POST） ═══════════ */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params;

  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: "不支持的操作" }, { status: 404 });
  }

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "今日调用次数过多，请明天再来" }, { status: 429 });
  }

  const apiKey = process.env.AI_API_KEY;
  const apiBase = (process.env.AI_API_BASE || "https://techsz.aoscdn.com").replace(
    /\/$/,
    ""
  );
  if (!apiKey) {
    return NextResponse.json({ error: "AI 服务暂未开通，请稍后再试" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const image = form.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.json({ error: "缺少图片" }, { status: 400 });
  }
  if (image.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "图片过大（上限 20MB），请先在本站压缩后再试" },
      { status: 413 }
    );
  }

  const userId = req.headers.get("x-user-id") || "anon";
  const authToken = req.headers.get("x-auth-token");

  /* 映射为佐糖字段：去水印走全屏自动识别（无 mask），抠图要透明 PNG */
  const upstream = new FormData();
  upstream.append("image_file", image, image.name || "image.png");
  upstream.append("sync", "0"); // 异步任务模式
  if (action === "matting") {
    upstream.append("return_type", "2"); // base64 返回（URL 仅 1 小时有效）
    upstream.append("format", "png"); // 透明背景
    upstream.append("output_type", "2"); // 只要结果图
    upstream.append("crop", "0"); // 保持原始尺寸
  }

  const createPath = TASKS[action].createPath;
  try {
    const res = await fetch(`${apiBase}${createPath}`, {
      method: "POST",
      headers: { "X-API-KEY": apiKey },
      body: upstream,
      signal: AbortSignal.timeout(CREATE_TIMEOUT_MS),
    });

    const json = (await res.json().catch(() => null)) as
      | { data?: { task_id?: string }; message?: string }
      | null;

    if (!res.ok) {
      console.error(
        `[ai/${action}] create failed: HTTP ${res.status} ${json?.message ?? ""}`
      );
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json(
          { error: "AI 服务暂未开通，请稍后再试" },
          { status: 503 }
        );
      }
      return busy();
    }
    const taskId = json?.data?.task_id;
    if (!taskId) {
      console.error(`[ai/${action}] create ok but no task_id: ${JSON.stringify(json)}`);
      return busy();
    }

    opsLog("ai_task_create", { action, userId, ip, taskId, token: authToken });
    return NextResponse.json({ taskId });
  } catch (err) {
    console.error(`[ai/${action}] create error:`, err instanceof Error ? err.message : err);
    return busy();
  }
}

/* ═══════════ 第二段：轮询任务（GET ?taskId=） ═══════════ */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params;

  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: "不支持的操作" }, { status: 404 });
  }

  const apiKey = process.env.AI_API_KEY;
  const apiBase = (process.env.AI_API_BASE || "https://techsz.aoscdn.com").replace(
    /\/$/,
    ""
  );
  if (!apiKey) {
    return NextResponse.json({ error: "AI 服务暂未开通，请稍后再试" }, { status: 503 });
  }

  const taskId = req.nextUrl.searchParams.get("taskId");
  if (!taskId) {
    return NextResponse.json({ error: "缺少 taskId" }, { status: 400 });
  }
  const userId = req.headers.get("x-user-id") || "anon";
  const authToken = req.headers.get("x-auth-token");

  const pollPath = `${TASKS[action].createPath}/${taskId}`;
  let poll: {
    data?: {
      state?: number;
      image?: string;
      file?: string;
      image_url?: string;
      progress?: number;
      use_point?: number;
      time_elapsed?: number;
    };
    message?: string;
  } | null;

  try {
    const r = await fetch(`${apiBase}${pollPath}`, {
      headers: { "X-API-KEY": apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    poll = (await r.json().catch(() => null)) as typeof poll;
    if (!r.ok) {
      console.error(`[ai/${action}] poll failed: HTTP ${r.status} ${poll?.message ?? ""}`);
      return busy();
    }
  } catch (err) {
    // 单次网络抖动不致命：让前端继续下一轮
    return NextResponse.json({ status: "processing" });
  }

  const state = poll?.data?.state;
  const imageField = poll?.data?.image_url || poll?.data?.image || poll?.data?.file;

  if (state === 1 && imageField) {
    try {
      const image = await toDataUrl(imageField);
      opsLog("ai_task_done", {
        action,
        userId,
        taskId,
        token: authToken,
        usePoint: poll?.data?.use_point,
        secs: poll?.data?.time_elapsed,
      });
      return NextResponse.json({ status: "done", image });
    } catch (err) {
      console.error(`[ai/${action}] result download failed:`, err);
      return busy();
    }
  }

  if (typeof state === "number" && state < 0) {
    opsLog("ai_task_fail", { action, userId, taskId, token: authToken, state, msg: poll?.message });
    // -7 = 无效图片；-14 = 内容不符合要求；其余为上游处理失败
    const msg =
      state === -7 || state === -14
        ? "图片无法识别，请更换图片后重试"
        : undefined;
    return busy(msg);
  }

  // state 0 / >1 = 排队或处理中
  return NextResponse.json({ status: "processing", progress: poll?.data?.progress ?? 0 });
}
