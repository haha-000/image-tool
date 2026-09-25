# EdgeOne Pages 国内部署指南

## 线上地址

**https://<你的项目名>.edgeone.app** （腾讯 EdgeOne 全球节点，大陆直连可访问）

- 控制台：https://console.tencentcloud.com/edgeone/pages/project/makers-qffi9nltxm3s
- 账号：EdgeOne 国际站（edgeone.ai，邮箱注册）
- 环境变量（Production）：`AI_API_KEY`、`AI_API_BASE`（佐糖 Key，控制台已配置）

> 备用海外线路：https://<你的项目名>.vercel.app （Vercel，大陆访问不稳定）

## 架构说明

EdgeOne 版 = **静态导出的前端 + node-functions 后端**（与 Vercel 版代码同源，前端零改动）：

| Vercel 版 | EdgeOne 版 | 说明 |
|---|---|---|
| `app/api/ai/[action]/route.ts` | `edgeone-functions/node-functions/api/ai/[action].js` | 两段式 AI 代理（创建+轮询），逻辑一一对应 |
| `app/api/track/route.ts` | `edgeone-functions/node-functions/api/track.js` | 埋点采集 |
| `app/api/feedback/route.ts` | `edgeone-functions/node-functions/api/feedback.js` | 反馈通道 |

路由规则：`node-functions/api/ai/[action].js` → `/api/ai/watermark`、`/api/ai/matting`（动态参数 `context.params.action`），与前端 `lib/ai-client.ts` 的请求路径完全一致。

环境变量通过 `context.env.AI_API_KEY` 读取（不是 process.env）。

## 为什么不用官方 auto-build

EdgeOne CLI 的 `edgeone pages deploy`（不带目录参数）会本地执行 `cmd /c npm install`，
在本机环境会**无限挂死**（npm 官方源 + cmd 子进程问题）。
因此改为手动构建 + 直接上传产物目录（官方支持的方式）。

## 更新部署（三步）

```bash
cd "D:/项目/图客/image-tool"

# 1. 静态构建（生成 .eo-build-*/out）
node scripts/build-edgeone.mjs

# 2. 组装产物（静态文件 + node-functions → 临时目录）
STG=$(ls -d .eo-build-* | tail -1)
rm -rf "$TMP/eo-publish"; mkdir -p "$TMP/eo-publish/node-functions/api/ai"
cp -r "$STG/out/." "$TMP/eo-publish/"
cp "edgeone-functions/node-functions/api/ai/[action].js" "$TMP/eo-publish/node-functions/api/ai/"
cp edgeone-functions/node-functions/api/track.js edgeone-functions/node-functions/api/feedback.js "$TMP/eo-publish/node-functions/api/"
echo '{"name":"image-tool-edgeone","private":true}' > "$TMP/eo-publish/package.json"

# 3. 部署（注意：必须传 Windows 格式路径）
npx -y edgeone pages deploy "$(cygpath -w "$TMP/eo-publish")" -n image-tool
```

## 常用运维命令

```bash
npx -y edgeone makers env ls -e production        # 查看环境变量
npx -y edgeone makers env set KEY VALUE -e production  # 更新环境变量
npx -y edgeone login -s global --local            # 重新登录（凭证在 .edgeone/auth.json）
```

## 已知坑（本机环境实测）

1. **auto-build 卡死**：`cmd /c npm install` 挂起无解，用手动构建绕过（见上）
2. **curl 上传文件路径**：Git Bash 的 `/tmp/...` 传给 curl `-F` 会失败（exit 26），必须 `cygpath -w` 转 Windows 路径
3. **EdgeOne CLI 部署目录参数**：同样需要 Windows 路径，`/tmp/...` 会报 `localPath does not exist`
4. **Node fs.cpSync 写项目内新目录**会被本机安全环境静默拦截（进程 exit 127 无输出），bash cp 正常 —— 构建脚本只做静态导出，组装用 bash
5. **junction 跨盘链接 node_modules** 会导致 webpack 解析失败（`Can't resolve './D:/...'`），staging 必须与项目同盘
6. **`.edgeone-build/`、`edgeone-dist/` 等旧目录被锁**（EPERM），删除不掉就换新目录名，残留无害（已进 .gitignore）

## 运营数据查看

- 任务数/失败数/反馈：EdgeOne 控制台 → 项目 → **日志**（Node Functions 日志），按 `ai_task_create` / `ai_task_done` / `ai_task_fail` / `track` / `feedback` 过滤，与 Vercel 版口径一致（详见 OPERATIONS.md）
