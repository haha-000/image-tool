# 图客工坊 · 运营手册（OPERATIONS.md）

MVP 阶段的运营数据体系：**零数据库、零成本**，全部数据落在 Vercel 平台里，够用且可平滑升级。
本文回答四个问题：用户是谁、用了多少、失败多少、用户在骂什么。

---

## 1. 三层数据体系（现状）

| 层 | 看什么 | 在哪里看 |
|---|---|---|
| 流量层 | 访问量、来源、各页面 PV、访客地区 | Vercel → 项目 → **Analytics** 标签页 |
| 行为层 | 工具使用次数、AI 成功/失败、下载量、付费弹窗曝光、模拟充值 | Vercel → 项目 → **Logs** 标签页（按事件名过滤，见下） |
| 用户之声 | 投诉、建议、联系方式 | Vercel → Logs 过滤 `feedback` |

## 2. 行为事件清单（Logs 里按关键字过滤）

前端埋点（`/api/track` 落日志，格式 `{"t":"track","event":"…","userId":"…",…}`）：

| event | 触发时机 | 关键字段 |
|---|---|---|
| `tool_used` | 压缩/转换完成 | tool, kbIn, kbOut, from, to |
| `ai_success` | AI 去水印/抠图成功 | tool, kb |
| `ai_fail` | AI 处理失败 | tool, reason |
| `download` | 任何下载点击 | tool |
| `paywall_open` | 付费弹窗曝光（转化漏斗起点） | hadFreeDownload |
| `recharge_sim` | 模拟充值选择 | plan, price |
| `feedback` | 用户提交反馈 | message, contact, page |

服务端任务日志（AI 代理直接落，比前端埋点更准）：

| t | 含义 | 关键字段 |
|---|---|---|
| `ai_task_create` | 任务创建 | action, userId, ip, taskId |
| `ai_task_done` | 任务成功 | action, userId, usePoint（算粒）, secs（耗时） |
| `ai_task_fail` | 任务失败 | action, userId, state（佐糖错误码）, msg |

**用户识别**：每个访客首次访问生成匿名 UUID（LocalStorage，`tuke-uid-v1`），所有事件与 AI 任务都带 `userId` —— 不需要注册登录也能数出独立用户数、看同一用户是否回访（次日出现同一 userId = 留存）。

## 3. 每日运营三分钟（怎么数数）

Vercel → 项目 → Logs，过滤关键字后按时间范围统计：

- **今日 AI 任务量**：过滤 `ai_task_done`，行数 = 成功任务数
- **失败率**：`ai_task_fail` 行数 ÷（done+fail）；> 10% 需要排查（多半是图片质量问题或算粒耗尽）
- **独立用户**：任选一个事件过滤后，对 `userId` 去重
- **转化漏斗**：`paywall_open`（曝光）→ `recharge_sim`（意向）。目前是模拟充值，真正的付费转化等接入支付后替换
- **算粒消耗**：`ai_task_done` 的 `usePoint` 求和，与佐糖后台（picwish.cn → 我的账户）对账
- **用户投诉**：过滤 `feedback`，带联系方式的可直接回访

**MVP 成功指标回顾**（上线后两周看）：
- 免费 → 付费转化 > 3% → 加大投入；< 1% → 调整功能或定价
- AI 功能使用率 < 20% → AI 不是刚需，重新考虑方向

## 4. 已知边界与升级路径

当前方案的取舍（MVP 合理，规模化后升级）：

| 现状 | 局限 | 升级方案 |
|---|---|---|
| 数据在 Vercel 日志 | 日志保留 1 天（Hobby）/ 7 天（Pro），不能做历史报表 | 接 **Supabase**（免费）：`events` 表 + `/api/track` 里 INSERT 一行即可，其余零改动 |
| 匿名 UUID | 清浏览器缓存即丢失；跨设备不识别 | Supabase Auth（邮箱/微信登录），userId 直接换成登录 ID |
| 模拟充值 | 无法真实收款 | 微信/支付宝当面付或聚合支付；`PaywallModal` 已预留替换点 |
| 内存级 IP 限流 | serverless 多实例下是近似值 | Upstash Redis（免费档）做精确计数 |
| 反馈在日志里 | 无通知、易漏看 | Resend 邮件通知（免费 100 封/天）或企业微信机器人 webhook |

## 5. 事故处理速查

- **AI 全挂（503「服务暂未开通」）**：先查佐糖算粒是否耗尽（picwish.cn → 我的账户），再查 Vercel 环境变量 `AI_API_KEY`
- **AI 失败率突增**：Logs 过滤 `ai_task_fail` 看 `state` 错误码（-7/-14 = 用户图片问题；-15 = 资源不足；-8 = 超时）
- **被刷**：单 IP 每日 50 次 AI 调用已限流；Logs 过滤 `ai_task_create` 观察 `ip`，异常 IP 段加 Vercel Firewall 规则
- **算粒告急**：1050 算粒 ≈ 525 次去水印（2 算粒/张）或 2100 次抠图（0.5 算粒/张）；`ai_task_done` 的 usePoint 求和对账，低于 200 时充值

## 6. 改动记录

- 2026-09-25 v2：去水印切换佐糖「全屏去水印-高级」API（自动识别，无需涂抹）；AI 代理改两段式任务架构（长任务不再超时）；新增运营埋点 /api/track、投诉通道 /api/feedback、匿名用户 ID、Vercel Analytics
