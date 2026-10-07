"use client";

import { useState } from "react";

import { ChatPanel } from "./ChatPanel";
import { HistoryPanel } from "./HistoryPanel";
import { TodoPanel } from "./TodoPanel";

import type {
  ChatMessage,
  Conversation,
  TodoItem,
} from "@/lib/types";

export function CoachWorkspace({
  todos,
  setTodos,
  notify,
  onProfile,
  conversations,
  setConversations,
  activeConversationId,
  setActiveConversationId,
}: {
  todos: TodoItem[];

  setTodos: React.Dispatch<
    React.SetStateAction<TodoItem[]>
  >;

  notify: (message: string) => void;

  onProfile: () => void;

  conversations: Conversation[];

  setConversations: React.Dispatch<
    React.SetStateAction<Conversation[]>
  >;

  activeConversationId: string | null;

  setActiveConversationId: React.Dispatch<
    React.SetStateAction<string | null>
  >;
}) {
  const [mobileView, setMobileView] =
    useState<"plan" | "coach">("coach");

  /*
   * activeConversationId 有時候在初始化階段會暫時是 null。
   *
   * 如果 conversations 已經有資料，
   * 就直接 fallback 到第一筆 conversation。
   */
  const resolvedConversationId =
    activeConversationId ??
    conversations[0]?.id ??
    null;

  const activeConversation =
    conversations.find(
      (conversation) =>
        conversation.id ===
        resolvedConversationId
    ) ??
    conversations[0] ??
    null;

  const messages =
    activeConversation?.messages ?? [];

  const title =
    activeConversation?.title ?? "新問題";

  /*
   * ChatPanel 所有 message 更新都會經過這裡。
   *
   * 不再因為 activeConversationId 暫時為 null
   * 就直接 return。
   */
  function setMessages(
    action: React.SetStateAction<ChatMessage[]>
  ) {
    const targetId =
      resolvedConversationId;

    if (!targetId) return;

    setConversations((items) =>
      items.map((conversation) => {
        if (
          conversation.id !== targetId
        ) {
          return conversation;
        }

        const nextMessages =
          typeof action === "function"
            ? action(
                conversation.messages
              )
            : action;

        return {
          ...conversation,
          messages: nextMessages,
          updatedAt:
            new Date().toISOString(),
        };
      })
    );

    /*
     * 如果目前只是 fallback 到 conversations[0]，
     * 順便把它正式設成 active conversation。
     */
    if (!activeConversationId) {
      setActiveConversationId(
        targetId
      );
    }
  }

  function createNewConversation() {
    const id =
      `conversation-${Date.now()}`;

    const now =
      new Date().toISOString();

    const newConversation: Conversation = {
      id,
      title: "新問題",
      messages: [],
      createdAt: now,
      updatedAt: now,
    };

    setConversations((items) => [
      newConversation,
      ...items,
    ]);

    setActiveConversationId(id);
    setMobileView("coach");

    notify("已建立新的對話");
  }

  function openConversation(
    id: string
  ) {
    const conversation =
      conversations.find(
        (item) => item.id === id
      );

    if (!conversation) return;

    setActiveConversationId(id);
    setMobileView("coach");

    notify("已開啟過去的提問");
  }

  function updateConversationTitle(
    nextTitle: string
  ) {
    const targetId =
      resolvedConversationId;

    if (!targetId) return;

    setConversations((items) =>
      items.map((conversation) =>
        conversation.id === targetId
          ? {
              ...conversation,
              title: nextTitle,
              updatedAt:
                new Date().toISOString(),
            }
          : conversation
      )
    );

    if (!activeConversationId) {
      setActiveConversationId(
        targetId
      );
    }
  }

  function addPlan(
    plan: string
  ) {
    setTodos((items) => [
      {
        id: `plan-${Date.now()}`,
        title: plan,
        due: "11/15",
        tag: "AI 建議",
        done: false,
      },
      ...items,
    ]);

    notify("已加入你的生涯待辦");
  }

  return (
    <main className="relative flex min-h-0 flex-1 overflow-hidden pb-12 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:pb-0">
      <aside
        className={`${
          mobileView === "plan"
            ? "flex"
            : "hidden"
        } min-h-0 w-full flex-col overflow-y-auto border-r border-[var(--line)] bg-[var(--panel)] lg:flex`}
      >
        <HistoryPanel
          onQuestion={(question) => {
            /*
             * HistoryPanel 目前還是舊版，
             * 暫時以 title 找 conversation。
             *
             * 下一步我們會正式改成直接使用 conversation id。
             */
            const conversation =
              conversations.find(
                (item) =>
                  item.title === question
              );

            if (conversation) {
              openConversation(
                conversation.id
              );
            }
          }}
          notify={notify}
        />

        <TodoPanel
          todos={todos}
          setTodos={setTodos}
          notify={notify}
        />
      </aside>

      <div
        className={`${
          mobileView === "coach"
            ? "flex"
            : "hidden"
        } min-h-0 w-full flex-1 lg:flex`}
      >
        {activeConversation ? (
          <ChatPanel
            title={title}
            onTitleChange={
              updateConversationTitle
            }
            addPlan={addPlan}
            notify={notify}
            messages={messages}
            setMessages={setMessages}
          />
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center text-sm text-[var(--muted)]">
            正在準備 AI Coach…
          </div>
        )}
      </div>

      <nav className="fixed right-0 bottom-0 left-0 z-30 grid h-12 grid-cols-3 border-t border-[var(--line)] bg-[var(--panel)] lg:hidden">
        <button
          className={
            mobileView === "plan"
              ? "bg-[var(--paper)] text-[var(--paper-ink)]"
              : "text-[var(--muted)]"
          }
          onClick={() =>
            setMobileView("plan")
          }
        >
          計畫
        </button>

        <button
          className={
            mobileView === "coach"
              ? "bg-[var(--paper)] text-[var(--paper-ink)]"
              : "text-[var(--muted)]"
          }
          onClick={() =>
            setMobileView("coach")
          }
        >
          AI Coach
        </button>

        <button
          className="text-[var(--muted)]"
          onClick={onProfile}
        >
          檔案
        </button>
      </nav>
    </main>
  );
}