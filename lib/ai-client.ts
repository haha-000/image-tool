/**
 * 统一 AI API 调用模块（前端侧）
 * 所有 AI 能力都走本站 /api/ai/* 后端代理，浏览器里永远不出现 API Key。
 *
 * 两段式任务流（适配佐糖异步任务，长任务不占 serverless 时长）：
 *   1. POST /api/ai/{action} → 返回 { taskId }
 *   2. 浏览器每 1.5s GET /api/ai/{action}?taskId= → { status: "processing" | "done" }
 *   3. done 时拿 dataURL 结果（服务端已把 1 小时时效的 URL 转存为 base64）
 *
 * 切换或增加备用 API 只需改服务端 app/api/ai/[action]/route.ts，前端零改动。
 */

import { getUserId } from "@/lib/track";

export type AiAction = "watermark" | "matting";

export interface AiResponse {
  image: string; // 处理结果：dataURL
}

export class AiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const POLL_INTERVAL_MS = 1_500;
const POLL_BUDGET_MS = 180_000; // 全屏去水印官方示例 53s，留足余量

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function requestAi(action: AiAction, body: FormData): Promise<AiResponse> {
  const headers: Record<string, string> = { "x-user-id": getUserId() };
  // 登录用户附带会话 token，服务端把任务事件关联到 uid 主键
  try {
    const t = localStorage.getItem("tuke-token-v1");
    if (t) headers["x-auth-token"] = t;
  } catch {
    /* 无 localStorage 环境忽略 */
  }

  /* ── 1. 创建任务 ── */
  const createRes = await fetch(`/api/ai/${action}`, { method: "POST", body, headers });
  let createData: { taskId?: string; image?: string; error?: string } = {};
  try {
    createData = await createRes.json();
  } catch {
    /* 非 JSON 响应 */
  }
  if (!createRes.ok) {
    throw new AiError(createData.error || "服务繁忙，请稍后再试", createRes.status);
  }
  // 兜底：后端直接返回结果（同步模式）
  if (createData.image) return { image: createData.image };

  const taskId = createData.taskId;
  if (!taskId) throw new AiError("服务繁忙，请稍后再试", 502);

  /* ── 2. 轮询结果 ── */
  const deadline = Date.now() + POLL_BUDGET_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    let data: { status?: string; image?: string; error?: string } = {};
    try {
      const r = await fetch(`/api/ai/${action}?taskId=${encodeURIComponent(taskId)}`, {
        headers,
      });
      data = await r.json();
      if (!r.ok) {
        throw new AiError(data.error || "服务繁忙，请稍后再试", r.status);
      }
    } catch (err) {
      if (err instanceof AiError) throw err;
      continue; // 单次网络抖动，继续下一轮
    }

    if (data.status === "done" && data.image) return { image: data.image };
    // processing → 继续；error 已在上面 throw
  }

  throw new AiError("处理超时，请稍后再试", 504);
}
