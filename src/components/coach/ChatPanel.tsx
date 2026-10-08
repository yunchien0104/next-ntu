"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/lib/types";
type View = "chat" | "compare" | "sources";
type ChatPanelProps = {
  title: string;
  messages: ChatMessage[];
  busy: boolean;
  canStop: boolean;
  onStop: () => void;
  disabled?: boolean;
  onSend: (question: string) => Promise<boolean>;
  onNewConversation: () => Promise<void>;
};
const quickPrompts = [
  {
    label: "實習準備",
    question: "依我的背景，幫我整理實習申請的準備方向。",
  },
  {
    label: "比較三條路線",
    question: "幫我比較三條學習或職涯路線。",
  },
  {
    label: "準備 coffee chat",
    question: "幫我準備向學長姊請教職涯的 coffee chat 問題。",
  },
];
export function ChatPanel({
  title,
  messages,
  busy,
  canStop,
  onStop,
  disabled = false,
  onSend,
  onNewConversation,
}: ChatPanelProps) {
  const [view, setView] = useState<View>("chat");
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [localError, setLocalError] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const creatingRef = useRef(false);
  const composingRef = useRef(false);
  const followBottomRef = useRef(true);
  const firstMessageRef = useRef<string | null>(null);
  const blocked = disabled || busy || sending || creating;
  const lastMessage = messages[messages.length - 1];
  const hasReplyText = Boolean(
    lastMessage?.role === "assistant" && lastMessage.content,
  );
  function scrollToBottom() {
    const container = scrollRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
    followBottomRef.current = true;
    setShowScrollButton(false);
  }
  function handleScroll() {
    const container = scrollRef.current;
    if (!container) {
      return;
    }
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distanceFromBottom < 100;
    followBottomRef.current = nearBottom;
    setShowScrollButton(!nearBottom);
  }
  useEffect(() => {
    if (view !== "chat") {
      return;
    }
    const firstMessageId = messages[0]?.id ?? null;
    // 切換對話後，顯示該對話的最新內容。
    if (firstMessageRef.current !== firstMessageId) {
      firstMessageRef.current = firstMessageId;
      followBottomRef.current = true;
      setShowScrollButton(false);
    }
    if (!followBottomRef.current) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (container && followBottomRef.current) {
        // 串流期間直接跟隨底部，避免反覆平滑動畫。
        container.scrollTop = container.scrollHeight;
      }
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [messages, view, busy]);
  async function send() {
    const question = prompt.trim();
    if (!question || blocked || sendingRef.current) {
      return;
    }
    if (question.length > 8000) {
      setLocalError("每則問題最多 8,000 字，請縮短後再送出。");
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setLocalError("");
    setPrompt("");
    setView("chat");
    followBottomRef.current = true;
    setShowScrollButton(false);
    try {
      const success = await onSend(question);
      if (!success) {
        setPrompt((current) => current || question);
      }
    } catch (cause) {
      setPrompt((current) => current || question);
      setLocalError(
        cause instanceof Error ? cause.message : "送出失敗，請稍後再試。",
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }
  async function createNewConversation() {
    if (blocked || creatingRef.current || sendingRef.current) {
      return;
    }
    creatingRef.current = true;
    setCreating(true);
    setLocalError("");
    try {
      await onNewConversation();
      setView("chat");
      followBottomRef.current = true;
      setShowScrollButton(false);
    } catch (cause) {
      setLocalError(
        cause instanceof Error ? cause.message : "新對話建立失敗，請稍後再試。",
      );
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }
  function handleKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    // 中文輸入法選字時，Enter 不送出。
    if (
      composingRef.current ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229
    ) {
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }
  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[var(--bg)]">
      <header className="border-b border-[var(--line)] px-5 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-[-.03em] md:text-xl">
              {title}
            </h1>
            <p className="mt-1 text-xs text-[var(--muted)]">
              根據你的問題與已解析素材，整理學習與職涯建議
            </p>
          </div>
          <Button
            disabled={blocked}
            onClick={() => {
              void createNewConversation();
            }}
          >
            {creating ? "建立中…" : "新規劃"}
          </Button>
        </div>
        <nav className="mt-5 flex gap-5" aria-label="內容分頁">
          {(
            [
              ["chat", "AI 對話"],
              ["compare", "方案比較"],
              ["sources", "資料來源"],
            ] as Array<[View, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              className={cn(
                "border-b-2 pb-3 text-xs font-semibold",
                view === key
                  ? "border-[var(--paper)] text-[var(--text)]"
                  : "border-transparent text-[var(--muted)]",
              )}
              onClick={() => {
                setView(key);
                if (key === "chat") {
                  followBottomRef.current = true;
                }
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 md:p-7"
        >
          {view === "chat" && (
            <div className="mx-auto max-w-4xl space-y-6">
              {messages.length === 0 && (
                <div className="py-10 text-center">
                  <div className="font-mono text-[9px] tracking-[.14em] text-[var(--muted)]">
                    NEXT@NTU · AI COACH
                  </div>
                  <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-[var(--soft)]">
                    告訴我你目前的背景、正在考慮的選項，
                    或你最想解決的學業與職涯問題。
                  </p>
                </div>
              )}
              {messages.map((message, index) => {
                const isLast = index === messages.length - 1;
                const isResponding =
                  canStop && isLast && message.role === "assistant";
                const hasContent = message.content.length > 0;
                if (message.role === "user") {
                  return (
                    <div
                      key={message.id}
                      className="flex justify-end animate-rise"
                    >
                      <div className="max-w-[82%] whitespace-pre-wrap break-words bg-[var(--paper)] px-4 py-3 text-sm leading-6 text-[var(--paper-ink)]">
                        {message.content}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={message.id} className="animate-rise">
                    <div className="font-mono text-[9px] tracking-[.14em] text-[var(--muted)]">
                      PATH COACH ·{" "}
                      {isResponding
                        ? hasContent
                          ? "RESPONDING"
                          : "THINKING"
                        : message.pending
                          ? "THINKING"
                          : "PERSONALIZED"}
                    </div>
                    {hasContent ? (
                      <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[var(--soft)]">
                        {message.content}
                        {isResponding && (
                          <span
                            aria-hidden="true"
                            className="ml-1 inline-block h-4 w-1 animate-pulse bg-[var(--soft)] align-middle"
                          />
                        )}
                      </div>
                    ) : message.pending || isResponding ? (
                      <div
                        role="status"
                        className="mt-3 flex items-center gap-2"
                      >
                        <div aria-hidden="true" className="flex gap-1">
                          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--soft)]" />
                          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--soft)]" />
                          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--soft)]" />
                        </div>
                        <span className="text-[10px] text-[var(--muted)]">
                          正在準備回答…
                        </span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
          {view === "compare" && (
            <div className="mx-auto max-w-4xl animate-rise">
              <div className="font-mono text-[9px] tracking-[.14em] text-[var(--muted)]">
                SCENARIO MATRIX
              </div>
              <p className="my-4 text-sm leading-7 text-[var(--soft)]">
                方案比較功能尚未開放。 你可以先在 AI 對話中提出想比較的選項。
              </p>
            </div>
          )}
          {view === "sources" && (
            <div className="mx-auto max-w-4xl space-y-3 animate-rise">
              <div className="font-mono text-[9px] tracking-[.14em] text-[var(--muted)]">
                SOURCE CABINET
              </div>
              <p className="text-sm leading-7 text-[var(--soft)]">
                素材引用會顯示在 AI 回答中。 獨立的資料來源清單尚未開放。
              </p>
            </div>
          )}
        </div>
        {view === "chat" && showScrollButton && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 border border-[var(--line-strong)] bg-[var(--panel)] px-4 py-2 text-xs text-[var(--text)] shadow-lg"
          >
            ↓ 最新回答
          </button>
        )}
      </div>
      <div className="border-t border-[var(--line)] bg-[var(--panel)] p-3 md:p-4">
        <div className="mx-auto max-w-4xl border border-[var(--line-strong)] bg-[var(--bg)] p-3">
          <textarea
            aria-label="輸入學習或職涯問題"
            className="min-h-14 w-full resize-y bg-transparent text-sm outline-none placeholder:text-[var(--muted)] disabled:opacity-60"
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);
              if (localError) {
                setLocalError("");
              }
            }}
            onKeyDown={handleKey}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
            }}
            disabled={blocked}
            placeholder="問選課、實習、研究所、社團或職涯規劃…"
          />
          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="hidden flex-wrap gap-1.5 md:flex">
              {quickPrompts.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="border border-[var(--line)] px-2 py-1 text-[9px] text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40"
                  disabled={blocked}
                  onClick={() => {
                    setPrompt(item.question);
                    setLocalError("");
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="ml-auto grid h-9 w-9 shrink-0 place-items-center bg-[var(--paper)] font-bold text-[var(--paper-ink)] disabled:opacity-40"
              onClick={() => {
                if (canStop) onStop();
                else void send();
              }}
              disabled={!canStop && (!prompt.trim() || blocked)}
              aria-label={canStop ? "停止產生回答" : "送出"}
              title={canStop ? "停止產生回答" : "送出"}
            >
              {canStop ? (
                <span aria-hidden="true" className="h-3 w-3 bg-current" />
              ) : (
                "↑"
              )}
            </button>
          </div>
          {localError && (
            <p role="alert" className="mt-2 text-xs text-red-400">
              {localError}
            </p>
          )}
          <div role="status" className="mt-2 text-[9px] text-[var(--muted)]">
            {canStop
              ? hasReplyText
                ? "AI 正在回答… · 點 ■ 停止"
                : "AI 正在準備回答… · 點 ■ 停止"
              : busy || sending
                ? "正在處理或儲存對話…"
                : "Enter 送出 · Shift + Enter 換行"}
          </div>
        </div>
      </div>
    </section>
  );
}
