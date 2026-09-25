import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // 多 lockfile 环境下显式指定 workspace root，避免推断到用户主目录
  outputFileTracingRoot: path.join(__dirname),
  // API 代理路由需要较大的请求体（图片上传）
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
