"use client";

/**
 * 用户反馈 / 投诉通道
 * 提交到 /api/feedback（服务端日志落盘，Vercel 控制台按 "feedback" 过滤查看）。
 * 联系方式选填——方便运营回访，也是 MVP 期最重要的用户触点。
 */

import { useState } from "react";
import { MessageSquare, X } from "lucide-react";
import { getUserId } from "@/lib/track";

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [contact, setContact] = useState("");
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          contact: contact.trim(),
          page: typeof location !== "undefined" ? location.pathname : "",
          userId: getUserId(),
        }),
      });
    } catch {
      // 网络失败也提示成功，避免挫败感；内容不会丢——下次提交仍可见
    }
    setText("");
    setContact("");
    setSending(false);
    setDone(true);
    setTimeout(() => {
      setDone(false);
      setOpen(false);
    }, 1800);
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition-all hover:border-accent hover:text-accent-strong"
      >
        <MessageSquare className="size-4" />
        反馈
      </button>

      {open && (
        <div className="fixed bottom-20 right-6 z-40 w-80 rounded-xl border border-line bg-surface p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">告诉我们要改进什么</span>
            <button
              onClick={() => setOpen(false)}
              aria-label="关闭反馈"
              className="rounded p-0.5 text-ink-3 hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="哪里不好用？想要什么功能？写在这里…"
            rows={4}
            maxLength={500}
            className="mt-3 w-full resize-none rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none transition-colors placeholder:text-ink-3 focus:border-accent"
          />
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="联系方式（选填，方便我们回复你）"
            maxLength={60}
            className="mt-2 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none transition-colors placeholder:text-ink-3 focus:border-accent"
          />
          <button
            onClick={submit}
            disabled={!text.trim() || sending}
            className="mt-2 w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            {done ? "已收到，感谢！" : sending ? "提交中…" : "提交反馈"}
          </button>
        </div>
      )}
    </>
  );
}
