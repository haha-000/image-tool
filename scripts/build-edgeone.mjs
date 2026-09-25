/**
 * EdgeOne Pages 构建脚本：Next.js 静态导出（前端部分）
 *
 * 背景：EdgeOne CLI 的 auto-build 在本机环境会卡死在 `cmd /c npm install`，
 * 因此手动构建后部署产物目录（官方支持：手动构建 dist 后 `edgeone pages deploy ./dist`）。
 *
 * 流程：
 *   1. 复制 app(去 api)/components/lib/public/配置 到项目内 staging 目录（同盘，webpack 正常解析）
 *   2. node_modules 用 Windows junction 链接（秒级，无需重装依赖）
 *   3. next build（output: 'export' 静态导出）→ staging/out
 *   4. 组装（out + edgeone-functions/node-functions）由 bash 完成，输出到系统临时目录
 *      —— 本环境 Node fs.cpSync 写项目内新目录会被拦截，bash cp 正常
 *
 * 用法：node scripts/build-edgeone.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/* staging 放项目内（同盘 junction + webpack 解析正常），每次唯一目录名，残留无害 */
const staging = path.join(root, `.eo-build-${Date.now()}`);

/* 删除失败不中断（目录被锁时换新名继续） */
const rmSafe = (p) => {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
};

/* ── 1. 准备 staging 目录 ── */
fs.mkdirSync(staging, { recursive: true });

const copyDir = (src, dest, skip = []) => {
  fs.cpSync(src, dest, { recursive: true, filter: (f) => !skip.some((s) => f.includes(s)) });
};

copyDir(path.join(root, "app"), path.join(staging, "app"), [path.sep + "api" + path.sep]);
copyDir(path.join(root, "components"), path.join(staging, "components"));
copyDir(path.join(root, "lib"), path.join(staging, "lib"));
if (fs.existsSync(path.join(root, "public")))
  copyDir(path.join(root, "public"), path.join(staging, "public"));
for (const f of ["package.json", "tsconfig.json", "postcss.config.mjs", "next-env.d.ts"])
  if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(staging, f));

/* 静态导出专用 next.config（源文件不动） */
fs.writeFileSync(
  path.join(staging, "next.config.mjs"),
  `/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};
export default nextConfig;
`
);

/* node_modules → junction 链接，避免复制/重装 */
fs.symlinkSync(path.join(root, "node_modules"), path.join(staging, "node_modules"), "junction");

/* ── 2. 构建 ── */
console.log("[build-edgeone] running next build (static export)...");
execSync("npx next build", { cwd: staging, stdio: "inherit", env: process.env });

console.log(`[build-edgeone] static export done → ${path.join(staging, "out")}`);
console.log("[build-edgeone] 组装产物请用 bash（见 DEPLOY-EDGEONE.md），避免 Node fs.cpSync 被环境拦截");
