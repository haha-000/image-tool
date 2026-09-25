import type { Metadata } from "next";
import "./globals.css";
import { QuotaProvider } from "@/components/QuotaProvider";
import Navbar from "@/components/Navbar";
import FeedbackWidget from "@/components/FeedbackWidget";

export const metadata: Metadata = {
  title: {
    default: "图客工坊 — 图片处理工具箱",
    template: "%s · 图客工坊",
  },
  description:
    "图片压缩、格式转换、AI 去水印、AI 抠图。压缩与转换在浏览器本地完成，图片不上传服务器。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen font-sans">
        <QuotaProvider>
          <Navbar />
          <main className="mx-auto max-w-5xl px-6 pb-24">{children}</main>
          <footer className="border-t border-line">
            <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-6 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between">
              <span>图客工坊 · 图片处理工具箱</span>
              <span>压缩与转换在浏览器本地完成，你的图片不会上传</span>
            </div>
          </footer>
          <FeedbackWidget />
        </QuotaProvider>
      </body>
    </html>
  );
}
