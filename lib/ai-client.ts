/**
 * 统一 AI API 调用模块（前端侧）
 * 所有 AI 能力都走本站 /api/ai/* 后端代理，浏览器里永远不出现 API Key。
 * 后续切换或增加备用 API 只需改服务端 app/api/ai/[action]/route.ts，前端零改动。
 */

export type AiAction = "watermark" | "matting";

export interface AiResponse {
  image: string; // 处理结果：dataURL 或 https URL
}

export class AiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function requestAi(action: AiAction, body: FormData): Promise<AiResponse> {
  const res = await fetch(`/api/ai/${action}`, {
    method: "POST",
    body,
  });

  let data: { image?: string; error?: string } = {};
  try {
    data = await res.json();
  } catch {
    // 上游返回了非 JSON 内容
  }

  if (!res.ok) {
    // 503 = 服务未配置；502/500 = 上游异常；429 = 触发风控
    throw new AiError(data.error || "服务繁忙，请稍后再试", res.status);
  }
  if (!data.image) {
    throw new AiError("服务繁忙，请稍后再试", 502);
  }
  return { image: data.image };
}
