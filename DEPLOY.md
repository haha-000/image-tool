# 图客工坊 · MVP 部署指导

> 面向零基础：从本地预览到公开访问链接，一步步来。

## 0. 你需要准备什么

- 一个 GitHub 账号（https://github.com 注册）
- 一个 Vercel 账号（https://vercel.com ，推荐直接点 "Sign in with GitHub"）
- 一个佐糖 PicWish API Key（见第 2 节）

## 1. 本地预览（上线前必须先在本地确认）

```bash
cd tuke-workshop
npm install          # 首次需要安装依赖
npm run dev          # 启动开发服务器
```

浏览器打开 http://localhost:3000 ，逐项检查：

- [ ] 首页四个工具卡片能正常跳转
- [ ] 压缩：上传图片 → 拖滑块 → 体积对比正确 → 能下载
- [ ] 转换：三种格式互转 → 透明背景预览正常 → 能下载
- [ ] 右上角额度徽章显示「今日剩余 AI 次数：3/3」
- [ ] （配好有效 Key 后）去水印 / 抠图能出结果、额度减 1

## 2. 配置 AI 服务（佐糖 PicWish）

本项目已按**佐糖官方 API**适配完成（去水印走消除笔接口、抠图走万物抠图接口），只需要两步：

### 第 1 步：获取 API Key

1. 登录 https://picwish.cn （没账号先注册）
2. 右上角账号 → **我的账户** → **API Key**
3. 新用户接入即送 **1000 算粒试用**（约可处理 500 次去水印 / 2000 次抠图）

### 第 2 步：填入配置并验证

把 `.env.example` 复制一份，重命名为 `.env.local`，填入：

```
AI_API_KEY=你的真实key
AI_API_BASE=https://techsz.aoscdn.com
```

然后运行验证脚本（10 秒确认 Key 是否有效）：

```bash
npm run verify:key
```

- 输出 `✓ Key 有效` → 直接启动使用
- 输出 `✗ Key 无效` → 回到第 1 步检查，**Key 必须是 picwish.cn 的**（国际版 picwish.com 账号不互通）

**计费参考**（算粒）：去水印 1 算粒/张 ≈ ¥0.05 · 抠图 0.5 算粒/张 ≈ ¥0.025。对「3 次/天免费 + ¥9.9/20 积分」的定价有约 10~20 倍毛利空间。

**安全说明**：`.env.local` 在 `.gitignore` 里，不会被上传。前端代码里搜不到任何 Key —— 所有 AI 请求都走 `/api/ai/*` 后端代理（Key 只在服务端使用，含单 IP 每日限流防刷）。

**故障对照**：AI 功能提示「服务繁忙」= 上游处理失败（额度会自动退还）；提示「AI 服务暂未开通」= Key 未配置或已失效，跑一遍 `npm run verify:key` 排查。

## 3. 上传到 GitHub

在 GitHub 上新建一个空仓库（不要勾选任何初始化选项），然后在本目录执行：

```bash
git init
git add .
git commit -m "图客工坊 MVP"
git branch -M main
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

> 如果系统提示 git 未安装：去 https://git-scm.com 下载安装，一路下一步即可。

## 4. Vercel 一键部署

1. 打开 https://vercel.com/new ，点 "Import Git Repository" 选中刚才的仓库
2. 框架会自动识别为 Next.js，**不用改任何构建配置**，直接点 Deploy
3. 等约 2 分钟，得到公开访问链接（形如 `<项目名>.vercel.app`）
4. **关键**：进入项目 → Settings → Environment Variables，添加 `AI_API_KEY` 和 `AI_API_BASE` 两个变量（值与 `.env.local` 相同），然后 Deployments → 最新一条 → Redeploy

至此网站上线。以后改了代码，只要 `git push`，Vercel 自动重新部署。

### 备选：腾讯云 CloudBase 部署

1. 打开 https://console.cloud.tencent.com/tcb ，开通云开发环境（选按量付费，有免费额度）
2. 「静态网站托管」或「Web 应用托管」→ 导入 Git 仓库 → 选 GitHub 仓库
3. 构建命令 `npm run build`，输出目录 `.next`（选择 Next.js 模板会自动处理）
4. 同样在环境变量里配置 `AI_API_KEY` 和 `AI_API_BASE`

## 5. 上线后检查清单

- [ ] 手机打开链接，导航和上传都正常（响应式）
- [ ] 去水印/抠图走的是线上 API（不是 localhost）
- [ ] 额度用完时弹窗正常、关闭按钮可用
- [ ] 处理失败时提示「服务繁忙」且额度被退还

## 6. MVP 验证指标（上线后 2 周重点看）

| 指标 | 及格线 | 说明 |
|------|--------|------|
| 免费 → 付费转化率 | ≥ 3% 继续投入；< 1% 调整功能或定价 | 核心验证目标 |
| 日活用户 | 持续增长 | 看有多少人回来用 |
| AI 功能使用率 | — | 若 80% 用户只用压缩/转换，AI 不是刚需，重新考虑方向 |

## 7. 已知边界（MVP 范围内的取舍）

- **支付未接入**：弹窗里的充值是「模拟到账」（点选套餐即加积分），验证期用「手动收款 + 后台改额度」跑通流程即可；正式接入微信/支付宝时只需改 `components/PaywallModal.tsx` 和 `lib/quota.ts`
- **额度存 LocalStorage**：换浏览器/清缓存会重置。验证期够用，正式版应迁移到账号体系
- **防刷为内存级限流**：serverless 实例重启会清零。被刷时再上 Upstash Redis（免费额度够 MVP）
- **反馈存本地**：用户点「反馈」提交的内容在其浏览器 LocalStorage，正式版应接后端接口
