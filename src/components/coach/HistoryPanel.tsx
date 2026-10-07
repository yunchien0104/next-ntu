"use client";

import { useState } from "react";

import {
  historyFolders,
} from "@/lib/data";

import { cn } from "@/lib/cn";

import type {
  Conversation,
} from "@/lib/types";

export function HistoryPanel({
  conversations,
  activeConversationId,
  onConversationSelect,
  onNewConversation,
}: {
  conversations: Conversation[];

  activeConversationId:
    | string
    | null;

  onConversationSelect: (
    id: string
  ) => void;

  onNewConversation: () => void;
}) {
  const [tab, setTab] =
    useState<
      "folders" | "conversations"
    >("conversations");

  function formatConversationMeta(
    conversation: Conversation
  ) {
    const messageCount =
      conversation.messages.length;

    if (messageCount === 0) {
      return "尚未開始";
    }

    return `${messageCount} 則訊息`;
  }

  return (
    <section className="min-h-0 border-b border-[var(--line)]">
      <header className="flex h-14 items-center justify-between border-b border-[var(--line)] px-4">
        <div>
          <div className="font-mono text-[9px] font-bold tracking-[.16em] text-[var(--muted)]">
            MEMORY
          </div>

          <h2 className="text-sm font-semibold">
            提問紀錄
          </h2>
        </div>

        <button
          type="button"
          className="grid h-8 w-8 place-items-center border border-[var(--line-strong)] text-sm hover:bg-[var(--panel-2)]"
          onClick={
            onNewConversation
          }
          aria-label="新增對話"
        >
          ＋
        </button>
      </header>

      <div className="max-h-[34vh] overflow-y-auto p-3 lg:max-h-none">
        <div className="mb-3 grid grid-cols-2 gap-1">
          <button
            type="button"
            className={cn(
              "border px-2 py-2 text-[10px]",
              tab === "folders"
                ? "border-[var(--paper)] bg-[var(--paper)] text-[var(--paper-ink)]"
                : "border-[var(--line)] text-[var(--muted)]"
            )}
            onClick={() =>
              setTab("folders")
            }
          >
            資料夾
          </button>

          <button
            type="button"
            className={cn(
              "border px-2 py-2 text-[10px]",
              tab ===
                "conversations"
                ? "border-[var(--paper)] bg-[var(--paper)] text-[var(--paper-ink)]"
                : "border-[var(--line)] text-[var(--muted)]"
            )}
            onClick={() =>
              setTab(
                "conversations"
              )
            }
          >
            所有對話
          </button>
        </div>

        {tab === "folders" ? (
          <div className="space-y-1.5">
            {historyFolders.map(
              ([
                title,
                description,
                count,
              ]) => (
                <button
                  type="button"
                  key={title}
                  className="grid w-full grid-cols-[28px_1fr_auto] items-center gap-2 border border-[var(--line)] bg-[var(--panel)] p-2.5 text-left transition hover:border-[var(--line-strong)] hover:bg-[var(--panel-2)]"
                >
                  <span className="text-[var(--soft)]">
                    ⌑
                  </span>

                  <span>
                    <b className="block text-xs">
                      {title}
                    </b>

                    <span className="text-[9px] text-[var(--muted)]">
                      {
                        description
                      }
                    </span>
                  </span>

                  <i className="font-mono text-[9px] not-italic text-[var(--muted)]">
                    {count}
                  </i>
                </button>
              )
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {conversations.length ===
              0 && (
              <div className="px-2 py-6 text-center text-[10px] text-[var(--muted)]">
                尚無對話
              </div>
            )}

            {conversations.map(
              (conversation) => {
                const isActive =
                  conversation.id ===
                  activeConversationId;

                return (
                  <button
                    type="button"
                    key={
                      conversation.id
                    }
                    className={cn(
                      "w-full border p-2.5 text-left transition",
                      isActive
                        ? "border-[#727272] bg-[var(--panel-2)]"
                        : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--line-strong)]"
                    )}
                    onClick={() =>
                      onConversationSelect(
                        conversation.id
                      )
                    }
                  >
                    <b className="block truncate text-xs leading-5">
                      {
                        conversation.title
                      }
                    </b>

                    <span className="text-[9px] text-[var(--muted)]">
                      {formatConversationMeta(
                        conversation
                      )}
                    </span>
                  </button>
                );
              }
            )}
          </div>
        )}
      </div>
    </section>
  );
}