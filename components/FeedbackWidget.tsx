"use client";

/**
 * 用户反馈入口（MVP：本地暂存，验证期收集第一手反馈比任何数据都重要）
 * 后续接入后端后：把 submitFeedback 里的 localStorage 换成 POST /api/feedback。
 */

import { useState } from "react";
import { MessageSquare, X } from "lucide-react";

const FEEDBACK_KEY = "tuke-feedback-v1";

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);

  const submit = () => {
    if (!text.trim()) return;
    try {
      const list = JSON.parse(localStorage.getItem(FEEDBACK_KEY) || "[]");
      list.push({ text: text.trim(), at: new Date().toISOString() });
      localStorage.setItem(FEEDBACK_KEY, JSON.stringify(list.slice(-50)));
    } catch {
      // 忽略存储异常
    }
    setText("");
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
          <button
            onClick={submit}
            disabled={!text.trim()}
            className="mt-2 w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            {done ? "已收到，感谢！" : "提交反馈"}
          </button>
        </div>
      )}
    </>
  );
}
