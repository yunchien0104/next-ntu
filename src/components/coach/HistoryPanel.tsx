"use client";

import {
  useState,
} from "react";

import { cn } from "@/lib/cn";

import type {
  ChatFolder,
} from "@/lib/chat/repository";

import type {
  Conversation,
} from "@/lib/types";

type ConfirmState =
  | {
      type: "delete";
      conversationId: string;
      title: string;
    }
  | {
      type: "remove";
      conversationId: string;
      folderId: string;
      title: string;
    }
  | null;

type MenuState =
  | {
      type: "conversation";
      conversationId: string;
    }
  | {
      type: "folder";
      conversationId: string;
      folderId: string;
    }
  | null;

export function HistoryPanel({
  conversations,
  folders,
  activeConversationId,
  onConversationSelect,
  onNewConversation,
  onCreateFolder,
  onAddToFolder,
  onRemoveFromFolder,
  onDeleteConversation,
}: {
  conversations: Conversation[];

  folders: ChatFolder[];

  activeConversationId:
    | string
    | null;

  onConversationSelect: (
    id: string
  ) => void;

  onNewConversation:
    () => void | Promise<void>;

  onCreateFolder: (
    name: string
  ) => Promise<boolean>;

  onAddToFolder: (
    folderId: string,
    conversationId: string
  ) => Promise<boolean>;

  onRemoveFromFolder: (
    folderId: string,
    conversationId: string
  ) => Promise<boolean>;

  onDeleteConversation: (
    conversationId: string
  ) => Promise<boolean>;
}) {
  const [
    folderInputOpen,
    setFolderInputOpen,
  ] = useState(false);

  const [
    folderName,
    setFolderName,
  ] = useState("");

  const [
    menu,
    setMenu,
  ] = useState<MenuState>(null);

  const [
    confirm,
    setConfirm,
  ] = useState<ConfirmState>(
    null
  );

  const [
    working,
    setWorking,
  ] = useState(false);

  const [
    expandedFolders,
    setExpandedFolders,
  ] = useState<string[]>([]);

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

  function getConversation(
    conversationId: string
  ) {
    return conversations.find(
      (conversation) =>
        conversation.id ===
        conversationId
    );
  }

  function toggleFolder(
    folderId: string
  ) {
    setExpandedFolders(
      (items) =>
        items.includes(folderId)
          ? items.filter(
              (id) =>
                id !== folderId
            )
          : [
              ...items,
              folderId,
            ]
    );
  }

  async function createFolder() {
    const name =
      folderName.trim();

    if (
      !name ||
      working
    ) {
      return;
    }

    setWorking(true);

    const success =
      await onCreateFolder(
        name
      );

    setWorking(false);

    if (!success) {
      return;
    }

    setFolderName("");
    setFolderInputOpen(
      false
    );
  }

  async function addToFolder(
    folderId: string,
    conversationId: string
  ) {
    if (working) return;

    setWorking(true);

    const success =
      await onAddToFolder(
        folderId,
        conversationId
      );

    setWorking(false);

    if (success) {
      setMenu(null);

      setExpandedFolders(
        (items) =>
          items.includes(
            folderId
          )
            ? items
            : [
                ...items,
                folderId,
              ]
      );
    }
  }

  async function confirmAction() {
    if (
      !confirm ||
      working
    ) {
      return;
    }

    setWorking(true);

    let success = false;

    if (
      confirm.type ===
      "delete"
    ) {
      success =
        await onDeleteConversation(
          confirm.conversationId
        );
    } else {
      success =
        await onRemoveFromFolder(
          confirm.folderId,
          confirm.conversationId
        );
    }

    setWorking(false);

    if (success) {
      setConfirm(null);
      setMenu(null);
    }
  }

  return (
    <section className="relative min-h-0 border-b border-[var(--line)]">
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
          onClick={() => {
            void onNewConversation();
          }}
          aria-label="新增對話"
        >
          ＋
        </button>
      </header>

      <div className="max-h-[60vh] overflow-y-auto px-3 py-4 lg:max-h-none">
        {/* 所有對話標題 */}
        <div className="mb-3 flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold">
            所有對話
          </h3>

          <button
            type="button"
            className="grid h-7 w-7 place-items-center text-[var(--muted)] transition hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
            onClick={() => {
              setFolderInputOpen(
                true
              );

              setMenu(null);
            }}
            aria-label="新增資料夾"
            title="新增資料夾"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6.75A1.75 1.75 0 0 1 4.75 5h4l2 2h8.5A1.75 1.75 0 0 1 21 8.75v8.5A1.75 1.75 0 0 1 19.25 19H4.75A1.75 1.75 0 0 1 3 17.25Z" />

              <path d="M12 10v5" />
              <path d="M9.5 12.5h5" />
            </svg>
          </button>
        </div>

        {/* 新增資料夾 */}
        {folderInputOpen && (
          <div className="mb-4 border border-[var(--line)] bg-[var(--panel)] p-3">
            <label
              htmlFor="folder-name"
              className="mb-2 block text-[10px] font-semibold text-[var(--soft)]"
            >
              新增資料夾
            </label>

            <input
              id="folder-name"
              value={
                folderName
              }
              onChange={(
                event
              ) =>
                setFolderName(
                  event.target
                    .value
                )
              }
              onKeyDown={(
                event
              ) => {
                if (
                  event.key ===
                  "Enter"
                ) {
                  void createFolder();
                }
              }}
              autoFocus
              placeholder="輸入資料夾名稱"
              className="w-full border border-[var(--line-strong)] bg-[var(--bg)] px-2.5 py-2 text-xs outline-none"
            />

            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                className="px-2 py-1.5 text-[10px] text-[var(--muted)] hover:text-[var(--text)]"
                onClick={() => {
                  setFolderInputOpen(
                    false
                  );

                  setFolderName(
                    ""
                  );
                }}
              >
                取消
              </button>

              <button
                type="button"
                disabled={
                  !folderName.trim() ||
                  working
                }
                className="bg-[var(--paper)] px-3 py-1.5 text-[10px] font-semibold text-[var(--paper-ink)] disabled:opacity-40"
                onClick={() => {
                  void createFolder();
                }}
              >
                建立
              </button>
            </div>
          </div>
        )}

        {/* 使用者建立的資料夾 */}
        {folders.length >
          0 && (
          <div className="mb-5 space-y-2">
            {folders.map(
              (folder) => {
                const isExpanded =
                  expandedFolders.includes(
                    folder.id
                  );

                const folderConversations =
                  folder.conversationIds
                    .map(
                      (
                        conversationId
                      ) =>
                        getConversation(
                          conversationId
                        )
                    )
                    .filter(
                      (
                        conversation
                      ): conversation is Conversation =>
                        Boolean(
                          conversation
                        )
                    );

                return (
                  <div
                    key={
                      folder.id
                    }
                  >
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-1 py-1.5 text-left text-xs transition hover:bg-[var(--panel-2)]"
                      onClick={() =>
                        toggleFolder(
                          folder.id
                        )
                      }
                    >
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        className="h-3.5 w-3.5 shrink-0 text-[var(--muted)]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6.75A1.75 1.75 0 0 1 4.75 5h4l2 2h8.5A1.75 1.75 0 0 1 21 8.75v8.5A1.75 1.75 0 0 1 19.25 19H4.75A1.75 1.75 0 0 1 3 17.25Z" />
                      </svg>

                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {
                          folder.name
                        }
                      </span>

                      <span className="font-mono text-[9px] text-[var(--muted)]">
                        {
                          folderConversations.length
                        }
                      </span>

                      <span className="text-[9px] text-[var(--muted)]">
                        {isExpanded
                          ? "▾"
                          : "›"}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="mt-1 space-y-1 pl-4">
                        {folderConversations.length ===
                        0 ? (
                          <div className="px-2 py-2 text-[9px] text-[var(--muted)]">
                            尚無對話
                          </div>
                        ) : (
                          folderConversations.map(
                            (
                              conversation
                            ) => {
                              const isActive =
                                conversation.id ===
                                activeConversationId;

                              const menuOpen =
                                menu?.type ===
                                  "folder" &&
                                menu.conversationId ===
                                  conversation.id &&
                                menu.folderId ===
                                  folder.id;

                              return (
                                <div
                                  key={`${folder.id}-${conversation.id}`}
                                  className={cn(
                                    "relative flex items-start border transition",
                                    isActive
                                      ? "border-[#727272] bg-[var(--panel-2)]"
                                      : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--line-strong)]"
                                  )}
                                >
                                  <button
                                    type="button"
                                    className="min-w-0 flex-1 p-2.5 text-left"
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

                                  <button
                                    type="button"
                                    className="mt-1 grid h-8 w-8 shrink-0 place-items-center text-sm text-[var(--muted)] hover:text-[var(--text)]"
                                    aria-label="對話選單"
                                    onClick={(
                                      event
                                    ) => {
                                      event.stopPropagation();

                                      setMenu(
                                        menuOpen
                                          ? null
                                          : {
                                              type:
                                                "folder",
                                              conversationId:
                                                conversation.id,
                                              folderId:
                                                folder.id,
                                            }
                                      );
                                    }}
                                  >
                                    ⋯
                                  </button>

                                  {menuOpen && (
                                    <div className="absolute top-8 right-1 z-20 w-36 border border-[var(--line-strong)] bg-[var(--bg)] p-1 shadow-lg">
                                      <button
                                        type="button"
                                        className="w-full px-2.5 py-2 text-left text-[10px] hover:bg-[var(--panel-2)]"
                                        onClick={() => {
                                          setConfirm(
                                            {
                                              type:
                                                "remove",
                                              conversationId:
                                                conversation.id,
                                              folderId:
                                                folder.id,
                                              title:
                                                conversation.title,
                                            }
                                          );

                                          setMenu(
                                            null
                                          );
                                        }}
                                      >
                                        從資料夾移除
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            }
                          )
                        )}
                      </div>
                    )}
                  </div>
                );
              }
            )}
          </div>
        )}

        {/* 所有 conversations */}
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

              const menuOpen =
                menu?.type ===
                  "conversation" &&
                menu.conversationId ===
                  conversation.id;

              return (
                <div
                  key={
                    conversation.id
                  }
                  className={cn(
                    "relative flex items-start border transition",
                    isActive
                      ? "border-[#727272] bg-[var(--panel-2)]"
                      : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--line-strong)]"
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 p-2.5 text-left"
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

                  <button
                    type="button"
                    className="mt-1 grid h-8 w-8 shrink-0 place-items-center text-sm text-[var(--muted)] hover:text-[var(--text)]"
                    aria-label="對話選單"
                    onClick={(
                      event
                    ) => {
                      event.stopPropagation();

                      setMenu(
                        menuOpen
                          ? null
                          : {
                              type:
                                "conversation",
                              conversationId:
                                conversation.id,
                            }
                      );
                    }}
                  >
                    ⋯
                  </button>

                  {menuOpen && (
                    <div className="absolute top-8 right-1 z-30 w-44 border border-[var(--line-strong)] bg-[var(--bg)] p-1 shadow-lg">
                      <div className="px-2.5 py-1.5 text-[9px] font-semibold text-[var(--muted)]">
                        加入資料夾
                      </div>

                      {folders.length ===
                      0 ? (
                        <div className="px-2.5 py-2 text-[9px] text-[var(--muted)]">
                          尚未建立資料夾
                        </div>
                      ) : (
                        folders.map(
                          (
                            folder
                          ) => {
                            const alreadyAdded =
                              folder.conversationIds.includes(
                                conversation.id
                              );

                            return (
                              <button
                                key={
                                  folder.id
                                }
                                type="button"
                                disabled={
                                  alreadyAdded ||
                                  working
                                }
                                className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[10px] hover:bg-[var(--panel-2)] disabled:opacity-40"
                                onClick={() => {
                                  void addToFolder(
                                    folder.id,
                                    conversation.id
                                  );
                                }}
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  aria-hidden="true"
                                  className="h-3 w-3 shrink-0"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.7"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M3 6.75A1.75 1.75 0 0 1 4.75 5h4l2 2h8.5A1.75 1.75 0 0 1 21 8.75v8.5A1.75 1.75 0 0 1 19.25 19H4.75A1.75 1.75 0 0 1 3 17.25Z" />
                                </svg>

                                <span className="min-w-0 flex-1 truncate">
                                  {
                                    folder.name
                                  }
                                </span>

                                {alreadyAdded && (
                                  <span className="text-[9px]">
                                    ✓
                                  </span>
                                )}
                              </button>
                            );
                          }
                        )
                      )}

                      <div className="my-1 border-t border-[var(--line)]" />

                      <button
                        type="button"
                        className="w-full px-2.5 py-2 text-left text-[10px] hover:bg-[var(--panel-2)]"
                        onClick={() => {
                          setConfirm(
                            {
                              type:
                                "delete",
                              conversationId:
                                conversation.id,
                              title:
                                conversation.title,
                            }
                          );

                          setMenu(
                            null
                          );
                        }}
                      >
                        刪除對話
                      </button>
                    </div>
                  )}
                </div>
              );
            }
          )}
        </div>
      </div>

      {/* 刪除 / 移除確認視窗 */}
      {confirm && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-[280px] border border-[var(--line-strong)] bg-[var(--bg)] p-4 shadow-xl">
            <h3 className="text-sm font-semibold">
              {confirm.type ===
              "delete"
                ? "刪除對話"
                : "移出資料夾"}
            </h3>

            <p className="mt-3 text-xs leading-6 text-[var(--soft)]">
              {confirm.type ===
              "delete"
                ? "該對話將永久刪除，是否刪除該對話紀錄？"
                : "該對話僅移除資料夾，是否移除？"}
            </p>

            <p className="mt-2 truncate text-[10px] text-[var(--muted)]">
              {confirm.title}
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={
                  working
                }
                className="border border-[var(--line)] px-3 py-2 text-[10px] hover:bg-[var(--panel-2)] disabled:opacity-40"
                onClick={() =>
                  setConfirm(
                    null
                  )
                }
              >
                否
              </button>

              <button
                type="button"
                disabled={
                  working
                }
                className="bg-[var(--paper)] px-3 py-2 text-[10px] font-semibold text-[var(--paper-ink)] disabled:opacity-40"
                onClick={() => {
                  void confirmAction();
                }}
              >
                {confirm.type ===
                "delete"
                  ? "是，永久刪除"
                  : "是，移除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}