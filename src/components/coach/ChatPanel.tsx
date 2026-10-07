"use client";

import {
  KeyboardEvent,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/lib/types";

type View = "chat" | "compare" | "sources";

export function ChatPanel({
  title,
  onTitleChange,
  addPlan,
  notify,
  messages,
  setMessages,
}: {
  title: string;
  onTitleChange: (title: string) => void;
  addPlan: (title: string) => void;
  notify: (message: string) => void;
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
}) {
  const [view, setView] = useState<View>("chat");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  const quickPrompts = [
    "哪些實習快截止？",
    "幫我比較三條路線",
    "幫我找適合 coffee chat 的學長姊",
  ];

  async function send() {
    const question = prompt.trim();

    if (!question || busy) return;

    setBusy(true);

    const now = Date.now();
    const userId = `user-${now}`;
    const pendingId = `assistant-${now}`;

    setMessages((items) => [
      ...items,
      {
        id: userId,
        role: "user",
        content: question,
      },
      {
        id: pendingId,
        role: "assistant",
        content: "",
        pending: true,
      },
    ]);

    setPrompt("");
    setView("chat");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: question,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "AI request failed"
        );
      }

      setMessages((items) =>
        items.map((message) =>
          message.id === pendingId
            ? {
                ...message,
                content: data.reply,
                pending: false,
              }
            : message
        )
      );
    } catch (error) {
      console.error("Chat API error:", error);

      setMessages((items) =>
        items.map((message) =>
          message.id === pendingId
            ? {
                ...message,
                content:
                  "目前無法取得 AI 回覆，請稍後再試一次。",
                pending: false,
              }
            : message
        )
      );

      notify("AI 回覆失敗");
    } finally {
      setBusy(false);
    }
  }

  function handleKey(
    event: KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      send();
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
              依你的背景、截止日與公開資料即時整理
            </p>
          </div>

          <Button
            onClick={() => {
              setPrompt("");
              notify(
                "告訴我你現在最想解決的問題"
              );
            }}
          >
            新規劃
          </Button>
        </div>

        <nav
          className="mt-5 flex gap-5"
          aria-label="內容分頁"
        >
          {(
            [
              ["chat", "AI 對話"],
              ["compare", "方案比較"],
              ["sources", "資料來源 12"],
            ] as Array<[View, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              className={cn(
                "border-b-2 pb-3 text-xs font-semibold",
                view === key
                  ? "border-[var(--paper)] text-[var(--text)]"
                  : "border-transparent text-[var(--muted)]"
              )}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-7">
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

            {messages.map((message) =>
              message.role === "user" ? (
                <div
                  key={message.id}
                  className="flex justify-end animate-rise"
                >
                  <div className="max-w-[82%] bg-[var(--paper)] px-4 py-3 text-sm leading-6 text-[var(--paper-ink)]">
                    {message.content}
                  </div>
                </div>
              ) : (
                <div
                  key={message.id}
                  className="animate-rise"
                >
                  <div className="font-mono text-[9px] tracking-[.14em] text-[var(--muted)]">
                    PATH COACH ·{" "}
                    {message.pending
                      ? "THINKING"
                      : "PERSONALIZED"}
                  </div>

                  {message.pending ? (
                    <div className="mt-3 flex gap-1">
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--soft)]" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--soft)]" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--soft)]" />
                    </div>
                  ) : (
                    <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--soft)]">
                      {message.content}
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        )}

        {view === "compare" && (
          <div className="mx-auto max-w-4xl animate-rise">
            <div className="font-mono text-[9px] tracking-[.14em] text-[var(--muted)]">
              SCENARIO MATRIX
            </div>

            <p className="my-4 text-sm leading-7 text-[var(--soft)]">
              方案比較功能之後可以再接 AI，現在先保留介面。
            </p>
          </div>
        )}

        {view === "sources" && (
          <div className="mx-auto max-w-4xl space-y-3 animate-rise">
            <div className="font-mono text-[9px] tracking-[.14em] text-[var(--muted)]">
              SOURCE CABINET
            </div>

            <p className="text-sm leading-7 text-[var(--soft)]">
              資料來源功能之後會接 NTU RAG 與公開資料。
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-[var(--line)] bg-[var(--panel)] p-3 md:p-4">
        <div className="mx-auto max-w-4xl border border-[var(--line-strong)] bg-[var(--bg)] p-3">
          <textarea
            className="min-h-14 w-full bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
            value={prompt}
            onChange={(event) =>
              setPrompt(event.target.value)
            }
            onKeyDown={handleKey}
            placeholder="問選課、實習、研究所、社團或找學長姊…"
          />

          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="hidden flex-wrap gap-1.5 md:flex">
              {quickPrompts.map(
                (item, index) => (
                  <button
                    key={item}
                    className="border border-[var(--line)] px-2 py-1 text-[9px] text-[var(--muted)] hover:text-[var(--text)]"
                    onClick={() =>
                      setPrompt(item)
                    }
                  >
                    {
                      [
                        "快截止的實習",
                        "比較三條路線",
                        "找學長姊",
                      ][index]
                    }
                  </button>
                )
              )}
            </div>

            <button
              className="grid h-9 w-9 shrink-0 place-items-center bg-[var(--paper)] font-bold text-[var(--paper-ink)] disabled:opacity-40"
              onClick={send}
              disabled={
                !prompt.trim() || busy
              }
              aria-label="送出"
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}