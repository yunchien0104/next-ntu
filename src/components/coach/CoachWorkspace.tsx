"use client";

import { useState } from "react";

import { ChatPanel } from "./ChatPanel";
import { HistoryPanel } from "./HistoryPanel";
import { TodoPanel } from "./TodoPanel";

import type { CloudTasks } from "@/lib/tasks/useCloudTasks";

type CloudChat = ReturnType<
  typeof import("@/lib/chat/useCloudConversations").useCloudConversations
>;

type CoachWorkspaceProps = {
  taskStore: CloudTasks;
  notify: (message: string) => void;
  onProfile: () => void;
  chat: CloudChat;
};

export function CoachWorkspace({
  taskStore,
  notify,
  onProfile,
  chat,
}: CoachWorkspaceProps) {
  const [mobileView, setMobileView] =
    useState<"plan" | "coach">("coach");

  const activeConversation =
    chat.conversations.find(
      (conversation) =>
        conversation.id === chat.activeConversationId
    ) ??
    chat.conversations[0] ??
    null;

  const messages = activeConversation?.messages ?? [];
  const title = activeConversation?.title ?? "新問題";

  async function createNewConversation() {
    if (chat.busyAny) {
      notify("請先等待目前的 AI 回覆完成");
      return;
    }

    if (chat.unsavedCount > 0) {
      notify("請先重試尚未儲存的訊息");
      return;
    }

    const conversation = await chat.createConversation();

    if (!conversation) {
      notify("新對話建立失敗");
      return;
    }

    setMobileView("coach");
    notify("已建立新的對話");
  }

  function openConversation(id: string) {
    if (chat.busyAny) {
      notify("請先等待目前的 AI 回覆完成");
      return;
    }

    chat.setActiveConversationId(id);
    setMobileView("coach");
  }

  async function sendQuestion(
    question: string
  ): Promise<boolean> {
    const success = await chat.sendMessage(question);

    if (!success) {
      if (chat.unsavedCount > 0) {
        notify(
          "尚有訊息未成功存入雲端，請先重試儲存"
        );
      } else {
        notify("問題送出失敗，請稍後再試");
      }
    }

    return success;
  }

  async function createFolder(
    name: string
  ): Promise<boolean> {
    if (chat.busyAny) {
      notify("請先等待目前的 AI 回覆完成");
      return false;
    }

    if (chat.unsavedCount > 0) {
      notify("請先重試尚未儲存的訊息");
      return false;
    }

    const folder = await chat.createFolder(name);

    if (!folder) {
      notify("資料夾建立失敗");
      return false;
    }

    notify(`已建立資料夾「${folder.name}」`);
    return true;
  }

  async function addConversationToFolder(
    folderId: string,
    conversationId: string
  ): Promise<boolean> {
    if (chat.busyAny) {
      notify("請先等待目前的 AI 回覆完成");
      return false;
    }

    if (chat.unsavedCount > 0) {
      notify("請先重試尚未儲存的訊息");
      return false;
    }

    const success =
      await chat.addConversationToFolder(
        folderId,
        conversationId
      );

    if (!success) {
      notify("加入資料夾失敗");
      return false;
    }

    notify("已加入資料夾");
    return true;
  }

  async function removeConversationFromFolder(
    folderId: string,
    conversationId: string
  ): Promise<boolean> {
    if (chat.busyAny) {
      notify("請先等待目前的 AI 回覆完成");
      return false;
    }

    const success =
      await chat.removeConversationFromFolder(
        folderId,
        conversationId
      );

    if (!success) {
      notify("移出資料夾失敗");
      return false;
    }

    notify("已從資料夾移除");
    return true;
  }

  async function deleteConversation(
    conversationId: string
  ): Promise<boolean> {
    if (chat.busyAny) {
      notify("請先等待目前的 AI 回覆完成");
      return false;
    }

    if (chat.unsavedCount > 0) {
      notify("請先重試尚未儲存的訊息");
      return false;
    }

    const success =
      await chat.deleteConversation(conversationId);

    if (!success) {
      notify("刪除對話失敗");
      return false;
    }

    notify("對話已永久刪除");
    return true;
  }

  if (chat.loading) {
    return (
      <main className="grid min-h-0 flex-1 place-items-center bg-[var(--bg)] text-sm text-[var(--muted)]">
        正在載入對話…
      </main>
    );
  }

  return (
    <main className="relative flex min-h-0 flex-1 overflow-hidden pb-12 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:pb-0">
      <aside
        className={`${
          mobileView === "plan" ? "flex" : "hidden"
        } min-h-0 w-full flex-col overflow-y-auto border-r border-[var(--line)] bg-[var(--panel)] lg:flex`}
      >
        <HistoryPanel
          conversations={chat.conversations}
          folders={chat.folders}
          activeConversationId={chat.activeConversationId}
          onConversationSelect={openConversation}
          onNewConversation={createNewConversation}
          onCreateFolder={createFolder}
          onAddToFolder={addConversationToFolder}
          onRemoveFromFolder={
            removeConversationFromFolder
          }
          onDeleteConversation={deleteConversation}
        />

        <TodoPanel
          taskStore={taskStore}
          notify={notify}
        />
      </aside>

      <div
        className={`${
          mobileView === "coach" ? "flex" : "hidden"
        } min-h-0 w-full flex-1 flex-col lg:flex`}
      >
        {chat.error && (
          <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-4 py-2">
            <p className="text-[10px] leading-5 text-[var(--muted)]">
              {chat.error}
            </p>

            {chat.unsavedCount > 0 ? (
              <button
                type="button"
                className="shrink-0 border border-[var(--line-strong)] px-2 py-1 text-[9px] hover:bg-[var(--panel-2)]"
                onClick={() => {
                  void chat.retrySaving();
                }}
              >
                重試儲存
              </button>
            ) : (
              <button
                type="button"
                className="shrink-0 border border-[var(--line-strong)] px-2 py-1 text-[9px] hover:bg-[var(--panel-2)]"
                onClick={() => {
                  void chat.reload();
                }}
              >
                重新載入
              </button>
            )}
          </div>
        )}

        <ChatPanel
          title={title}
          messages={messages}
          busy={chat.busy}
          onSend={sendQuestion}
          onNewConversation={createNewConversation}
        />
      </div>

      <nav className="fixed right-0 bottom-0 left-0 z-30 grid h-12 grid-cols-3 border-t border-[var(--line)] bg-[var(--panel)] lg:hidden">
        <button
          type="button"
          className={
            mobileView === "plan"
              ? "bg-[var(--paper)] text-[var(--paper-ink)]"
              : "text-[var(--muted)]"
          }
          onClick={() => setMobileView("plan")}
        >
          計畫
        </button>

        <button
          type="button"
          className={
            mobileView === "coach"
              ? "bg-[var(--paper)] text-[var(--paper-ink)]"
              : "text-[var(--muted)]"
          }
          onClick={() => setMobileView("coach")}
        >
          AI Coach
        </button>

        <button
          type="button"
          className="text-[var(--muted)]"
          onClick={onProfile}
        >
          檔案
        </button>
      </nav>
    </main>
  );
}