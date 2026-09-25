/**
 * AI 能力统一后端代理 — EdgeOne Node Functions 移植版
 *
 * 移植自 app/api/ai/[action]/route.ts（Next.js），逻辑一一对应：
 *   POST /api/ai/watermark|matting  创建佐糖异步任务 → { taskId }
 *   GET  /api/ai/watermark|matting?taskId=  单次轮询 → { status, image? }
 *
 * 路由规则：node-functions/api/ai/[action].js → /api/ai/:action（动态参数 context.params.action）
 * 环境变量：EdgeOne 控制台配置（AI_API_KEY / AI_API_BASE），通过 context.env 读取
 */

import { verifySession, recordEvent, kvEnabled } from "../_lib.js";

const ALLOWED_ACTIONS = new Set(["watermark", "matting"]);

const TASKS = {
  watermark: { createPath: "/api/tasks/visual/advanced/watermark-remove", label: "去水印" },
  matting: { createPath: "/api/tasks/visual/segmentation", label: "抠图" },
};

const CREATE_TIMEOUT_MS = 30_000;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const RESULT_FETCH_TIMEOUT_MS = 20_000;

/* 单 IP 每日限流（仅创建接口计数） */
const IP_DAILY_LIMIT = 50;
const ipHits = new Map();

function rateLimited(ip) {
  const today = new Date().toISOString().slice(0, 10);
  const rec = ipHits.get(ip);
  if (!rec || rec.date !== today) {
    ipHits.set(ip, { date: today, count: 1 });
    return false;
  }
  rec.count += 1;
  return rec.count > IP_DAILY_LIMIT;
}

function clientIp(request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function opsLog(event, fields) {
  console.log(JSON.stringify({ t: event, ts: new Date().toISOString(), ...fields }));
  // AI 任务事件同步落库（关联登录用户 uid 主键），失败不影响响应
  if (kvEnabled() && (event === "ai_task_create" || event === "ai_task_done" || event === "ai_task_fail")) {
    resolveUidAndRecord(event, fields).catch(() => {});
  }
}

async function resolveUidAndRecord(event, fields) {
  const user = fields.token ? await verifySession(fields.token) : null;
  const props = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k === "token" || k === "ip") continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") props[k] = v;
  }
  await recordEvent({
    event,
    uid: user ? user.uid : undefined,
    anonId: user ? undefined : String(fields.userId || "anon").slice(0, 64),
    ip: String(fields.ip || "unknown"),
    ua: "ai-api",
    props,
  });
}

function base64ToDataUrl(field) {
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

/** 上游结果 → dataURL。URL 结果在服务端转存 base64（佐糖 URL 仅 1 小时有效） */
async function toDataUrl(field) {
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

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { "content-type": "application/json" },
});
const busy = (msg = "服务繁忙，请稍后再试") => json({ error: msg }, 502);

/* ═══════════ 第一段：创建任务（POST） ═══════════ */

export async function onRequestPost(context) {
  const { request, params, env } = context;
  const action = params.action;

  if (!ALLOWED_ACTIONS.has(action)) return json({ error: "不支持的操作" }, 404);

  const ip = clientIp(request);
  if (rateLimited(ip)) return json({ error: "今日调用次数过多，请明天再来" }, 429);

  const apiKey = env.AI_API_KEY;
  const apiBase = (env.AI_API_BASE || "https://techsz.aoscdn.com").replace(/\/$/, "");
  if (!apiKey) return json({ error: "AI 服务暂未开通，请稍后再试" }, 503);

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "请求格式错误" }, 400);
  }

  const image = form.get("image");
  if (!(image instanceof File) || image.size === 0) return json({ error: "缺少图片" }, 400);
  if (image.size > MAX_UPLOAD_BYTES)
    return json({ error: "图片过大（上限 20MB），请先在本站压缩后再试" }, 413);

  const userId = request.headers.get("x-user-id") || "anon";
  const authToken = request.headers.get("x-auth-token");

  const upstream = new FormData();
  upstream.append("image_file", image, image.name || "image.png");
  upstream.append("sync", "0");
  if (action === "matting") {
    upstream.append("return_type", "2");
    upstream.append("format", "png");
    upstream.append("output_type", "2");
    upstream.append("crop", "0");
  }

  try {
    const res = await fetch(`${apiBase}${TASKS[action].createPath}`, {
      method: "POST",
      headers: { "X-API-KEY": apiKey },
      body: upstream,
      signal: AbortSignal.timeout(CREATE_TIMEOUT_MS),
    });

    const data = (await res.json().catch(() => null))?.data;
    if (!res.ok) {
      console.error(`[ai/${action}] create failed: HTTP ${res.status}`);
      if (res.status === 401 || res.status === 403)
        return json({ error: "AI 服务暂未开通，请稍后再试" }, 503);
      return busy();
    }
    const taskId = data?.task_id;
    if (!taskId) {
      console.error(`[ai/${action}] create ok but no task_id`);
      return busy();
    }

    opsLog("ai_task_create", { action, userId, ip, taskId, token: authToken });
    return json({ taskId });
  } catch (err) {
    console.error(`[ai/${action}] create error:`, err?.message || err);
    return busy();
  }
}

/* ═══════════ 第二段：轮询任务（GET ?taskId=） ═══════════ */

export async function onRequestGet(context) {
  const { request, params, env } = context;
  const action = params.action;

  if (!ALLOWED_ACTIONS.has(action)) return json({ error: "不支持的操作" }, 404);

  const apiKey = env.AI_API_KEY;
  const apiBase = (env.AI_API_BASE || "https://techsz.aoscdn.com").replace(/\/$/, "");
  if (!apiKey) return json({ error: "AI 服务暂未开通，请稍后再试" }, 503);

  const taskId = new URL(request.url).searchParams.get("taskId");
  if (!taskId) return json({ error: "缺少 taskId" }, 400);
  const userId = request.headers.get("x-user-id") || "anon";
  const authToken = request.headers.get("x-auth-token");

  let poll;
  try {
    const r = await fetch(`${apiBase}${TASKS[action].createPath}/${taskId}`, {
      headers: { "X-API-KEY": apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    poll = (await r.json().catch(() => null));
    if (!r.ok) {
      console.error(`[ai/${action}] poll failed: HTTP ${r.status}`);
      return busy();
    }
  } catch {
    // 单次网络抖动不致命：让前端继续下一轮
    return json({ status: "processing" });
  }

  const state = poll?.data?.state;
  const imageField = poll?.data?.image_url || poll?.data?.image || poll?.data?.file;

  if (state === 1 && imageField) {
    try {
      const image = await toDataUrl(imageField);
      opsLog("ai_task_done", {
        action, userId, taskId, token: authToken,
        usePoint: poll?.data?.use_point,
        secs: poll?.data?.time_elapsed,
      });
      return json({ status: "done", image });
    } catch (err) {
      console.error(`[ai/${action}] result download failed:`, err?.message || err);
      return busy();
    }
  }

  if (typeof state === "number" && state < 0) {
    opsLog("ai_task_fail", { action, userId, taskId, token: authToken, state, msg: poll?.message });
    const msg = state === -7 || state === -14 ? "图片无法识别，请更换图片后重试" : undefined;
    return busy(msg);
  }

  return json({ status: "processing", progress: poll?.data?.progress ?? 0 });
}
