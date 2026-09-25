import Link from "next/link";
import { Eraser, Minimize2, RefreshCw, Scissors, ShieldCheck, Infinity as InfinityIcon, Coins } from "lucide-react";

const TOOLS = [
  {
    href: "/compress",
    icon: Minimize2,
    name: "图片压缩",
    desc: "自由调节压缩质量，最高可省 90% 体积",
    tag: "免费 · 不限次",
    tagClass: "bg-accent-soft text-accent-strong",
  },
  {
    href: "/convert",
    icon: RefreshCw,
    name: "格式转换",
    desc: "JPG / PNG / WebP 互转，透明通道处理得当",
    tag: "免费 · 不限次",
    tagClass: "bg-accent-soft text-accent-strong",
  },
  {
    href: "/watermark",
    icon: Eraser,
    name: "AI 去水印",
    desc: "涂抹水印区域，AI 自动修复画面",
    tag: "消耗 AI 额度",
    tagClass: "bg-amber-soft text-amber",
  },
  {
    href: "/matting",
    icon: Scissors,
    name: "AI 抠图",
    desc: "自动识别主体，秒出透明背景 PNG",
    tag: "消耗 AI 额度",
    tagClass: "bg-amber-soft text-amber",
  },
];

export default function HomePage() {
  return (
    <div className="pt-16 sm:pt-24">
      {/* Hero：留白与层级优先 */}
      <section className="mx-auto max-w-2xl text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2">
          <ShieldCheck className="size-3.5 text-accent" />
          压缩与转换在本地完成，图片不上传
        </div>
        <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          图片处理，
          <br className="sm:hidden" />
          一次搞定
        </h1>
        <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-ink-2">
          压缩、转格式免费不限次；AI 去水印、AI 抠图每天 3 次免费额度。不上传、不注册，打开就能用。
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/compress"
            className="rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
          >
            开始压缩图片
          </Link>
          <Link
            href="/watermark"
            className="rounded-lg border border-line-strong bg-surface px-6 py-2.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent-strong"
          >
            试试 AI 去水印
          </Link>
        </div>
      </section>

      {/* 工具卡片 */}
      <section className="mt-20 grid gap-4 sm:grid-cols-2">
        {TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="group rounded-xl border border-line bg-surface p-6 transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-sm"
          >
            <div className="flex items-start justify-between">
              <span className="flex size-10 items-center justify-center rounded-lg bg-surface-2 transition-colors group-hover:bg-accent-soft">
                <tool.icon className="size-5 text-ink-2 transition-colors group-hover:text-accent" />
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tool.tagClass}`}>
                {tool.tag}
              </span>
            </div>
            <h2 className="mt-4 text-base font-semibold">{tool.name}</h2>
            <p className="mt-1 text-sm text-ink-2">{tool.desc}</p>
          </Link>
        ))}
      </section>

      {/* 信任点 */}
      <section className="mt-16 grid gap-6 rounded-xl border border-line bg-surface px-8 py-8 sm:grid-cols-3">
        {[
          { icon: ShieldCheck, title: "隐私优先", desc: "压缩与格式转换纯浏览器本地计算，图片不经过任何服务器" },
          { icon: InfinityIcon, title: "基础功能免费", desc: "压缩、转换不限次数、不注册、不弹广告" },
          { icon: Coins, title: "额度透明", desc: "右上角实时显示今日剩余 AI 次数，次日自动重置" },
        ].map((item) => (
          <div key={item.title} className="flex gap-3">
            <item.icon className="mt-0.5 size-5 shrink-0 text-accent" />
            <div>
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">{item.desc}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
