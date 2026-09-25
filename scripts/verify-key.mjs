/**
 * API Key 有效性验证脚本 —— 用法：npm run verify:key
 *
 * 直接向佐糖创建一个最小抠图任务来验证 Key（不消耗算粒：任务会因
 * 无效图片被拒绝，但 401/200 的区别足以判断 Key 是否有效）。
 * 换新 Key 后先跑这个脚本，通过后再启动/部署。
 */

import fs from "node:fs";
import path from "node:path";

// 读 .env.local（不引入 dotenv 依赖，两行解析足够）
const envPath = path.join(process.cwd(), ".env.local");
const env = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m) env[m[1]] = m[2];
  }
}

const apiKey = env.AI_API_KEY || process.env.AI_API_KEY;
const apiBase = (env.AI_API_BASE || process.env.AI_API_BASE || "https://techsz.aoscdn.com").replace(/\/$/, "");

if (!apiKey) {
  console.error("✗ 未找到 AI_API_KEY，请检查 .env.local");
  process.exit(1);
}

console.log(`节点: ${apiBase}`);
console.log(`Key : ${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`);

// 1x1 像素 PNG —— 最小合法图片，若 Key 有效会创建任务成功（1x1 会被上游判定无效图片，
// 但那发生在认证之后；认证失败则直接 401）
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

try {
  const form = new FormData();
  form.append("image_file", new Blob([TINY_PNG], { type: "image/png" }), "probe.png");
  form.append("sync", "0");

  const res = await fetch(`${apiBase}/api/tasks/visual/segmentation`, {
    method: "POST",
    headers: { "X-API-KEY": apiKey },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json().catch(() => ({}));

  if (res.status === 401 || res.status === 403) {
    console.error(`✗ Key 无效（HTTP ${res.status}: ${json.message ?? "Invalid API key"}）`);
    console.error("  → 登录 picwish.cn → 我的账户 → API Key，复制有效的 Key 到 .env.local");
    process.exit(1);
  }
  if (res.ok) {
    console.log("✓ Key 有效（任务创建成功）—— AI 功能可正常使用");
    process.exit(0);
  }
  console.error(`? 非预期响应 HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  process.exit(1);
} catch (err) {
  console.error(`✗ 无法连接 ${apiBase}:`, err instanceof Error ? err.message : err);
  process.exit(1);
}
