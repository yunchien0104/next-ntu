"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (conversations.length === 0) {
      const now = new Date().toISOString();
      const id = `conversation-${Date.now()}`;

      const firstConversation: Conversation = {
        id,
        title: "新問題",
        messages: [],
        createdAt: now,
        updatedAt: now,
      };

      setConversations([firstConversation]);
      setActiveConversationId(id);

      return;
    }

    const activeStillExists =
      conversations.some(
        (conversation) =>
          conversation.id ===
          activeConversationId
      );

    if (
      !activeConversationId ||
      !activeStillExists
    ) {
      setActiveConversationId(
        conversations[0].id
      );
    }
  }, [
    conversations,
    activeConversationId,
    setConversations,
    setActiveConversationId,
  ]);

  const activeConversation =
    conversations.find(
      (conversation) =>
        conversation.id ===
        activeConversationId
    ) ?? null;

  const messages =
    activeConversation?.messages ?? [];

  const title =
    activeConversation?.title ?? "新問題";

  function setMessages(
    action: React.SetStateAction<ChatMessage[]>
  ) {
    if (!activeConversationId) return;

    setConversations((items) =>
      items.map((conversation) => {
        if (
          conversation.id !==
          activeConversationId
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

  function openConversation(id: string) {
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
    if (!activeConversationId) return;

    setConversations((items) =>
      items.map((conversation) =>
        conversation.id ===
        activeConversationId
          ? {
              ...conversation,
              title: nextTitle,
              updatedAt:
                new Date().toISOString(),
            }
          : conversation
      )
    );
  }

  function addPlan(plan: string) {
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