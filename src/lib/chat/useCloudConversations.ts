"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import { supabase } from "@/lib/supabase";

import type {
  Conversation,
} from "@/lib/types";

import {
  createChatRepository,
  type ChatFolder,
  type StoredMessage,
} from "./repository";

const repository =
  createChatRepository(supabase);

export function useCloudConversations(
  userId: string | null
) {
  const [
    conversations,
    setConversations,
  ] = useState<Conversation[]>([]);

  const [
    folders,
    setFolders,
  ] = useState<ChatFolder[]>([]);

  const [
    activeConversationId,
    setActiveConversationId,
  ] = useState<string | null>(
    null
  );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [
    busyIds,
    setBusyIds,
  ] = useState<string[]>([]);

  const [
    unsavedCount,
    setUnsavedCount,
  ] = useState(0);

  const [
    reloadVersion,
    setReloadVersion,
  ] = useState(0);

  const generation = useRef(0);

  const busy =
    useRef(
      new Set<string>()
    );

  const failedWrites =
    useRef(
      new Map<
        string,
        StoredMessage
      >()
    );

  const creating =
    useRef(false);

  const retrying =
    useRef(false);

  const folderBusy =
    useRef(false);

  const loadedOwner =
    useRef<string | null>(
      null
    );

  /*
   * 登入、切換帳號或 reload 時，
   * 同時讀取：
   *
   * 1. conversations
   * 2. folders
   */
  useEffect(() => {
    const current =
      ++generation.current;

    loadedOwner.current = null;

    busy.current =
      new Set();

    failedWrites.current =
      new Map();

    creating.current = false;
    retrying.current = false;
    folderBusy.current = false;

    setConversations([]);
    setFolders([]);

    setActiveConversationId(
      null
    );

    setBusyIds([]);
    setUnsavedCount(0);
    setError("");

    setLoading(
      Boolean(userId)
    );

    if (!userId) {
      return;
    }

    Promise.all([
      repository.load(userId),
      repository.loadFolders(
        userId
      ),
    ])
      .then(
        ([
          conversationItems,
          folderItems,
        ]) => {
          if (
            current !==
            generation.current
          ) {
            return;
          }

          loadedOwner.current =
            userId;

          setConversations(
            conversationItems
          );

          setFolders(
            folderItems
          );

          setActiveConversationId(
            conversationItems[0]
              ?.id ?? null
          );

          setLoading(false);
        }
      )
      .catch(
        (
          cause: unknown
        ) => {
          if (
            current !==
            generation.current
          ) {
            return;
          }

          console.error(
            "Load chat data failed",
            cause
          );

          setError(
            "無法讀取雲端對話或資料夾。請確認 Supabase 資料表與權限設定，再重試。"
          );

          setLoading(false);
        }
      );

    return () => {
      generation.current++;
    };
  }, [
    userId,
    reloadVersion,
  ]);

  const ready = Boolean(
    userId &&
      loadedOwner.current ===
        userId &&
      !loading
  );

  /*
   * 建立新 conversation。
   */
  async function createConversation(
    title = "新問題"
  ) {
    if (
      !userId ||
      !ready ||
      creating.current
    ) {
      return null;
    }

    const current =
      generation.current;

    creating.current = true;

    try {
      const conversation =
        await repository.create(
          userId,
          title
        );

      if (
        current !==
        generation.current
      ) {
        return null;
      }

      setConversations(
        (items) => [
          conversation,
          ...items,
        ]
      );

      setActiveConversationId(
        conversation.id
      );

      return conversation;
    } catch (cause) {
      if (
        current ===
        generation.current
      ) {
        console.error(
          "Create conversation failed",
          cause
        );

        setError(
          "新對話未建立成功，請確認網路後重試。"
        );
      }

      return null;
    } finally {
      if (
        current ===
        generation.current
      ) {
        creating.current =
          false;
      }
    }
  }

  /*
   * 建立資料夾。
   */
  async function createFolder(
    name: string
  ): Promise<ChatFolder | null> {
    const trimmedName =
      name.trim();

    if (
      !userId ||
      !ready ||
      !trimmedName ||
      folderBusy.current
    ) {
      return null;
    }

    const current =
      generation.current;

    folderBusy.current = true;

    try {
      const folder =
        await repository.createFolder(
          userId,
          trimmedName
        );

      if (
        current !==
        generation.current
      ) {
        return null;
      }

      setFolders((items) => [
        folder,
        ...items,
      ]);

      return folder;
    } catch (cause) {
      if (
        current ===
        generation.current
      ) {
        console.error(
          "Create folder failed",
          cause
        );

        setError(
          "資料夾建立失敗，請稍後再試。"
        );
      }

      return null;
    } finally {
      if (
        current ===
        generation.current
      ) {
        folderBusy.current =
          false;
      }
    }
  }

  /*
   * 將 conversation 加入資料夾。
   *
   * 不複製 conversation。
   * 只新增 folder-conversation 關聯。
   */
  async function addConversationToFolder(
    folderId: string,
    conversationId: string
  ): Promise<boolean> {
    if (
      !userId ||
      !ready ||
      folderBusy.current
    ) {
      return false;
    }

    const folder =
      folders.find(
        (item) =>
          item.id === folderId
      );

    const conversationExists =
      conversations.some(
        (item) =>
          item.id ===
          conversationId
      );

    if (
      !folder ||
      !conversationExists
    ) {
      return false;
    }

    /*
     * 已經在這個資料夾就不用再加。
     */
    if (
      folder.conversationIds.includes(
        conversationId
      )
    ) {
      return true;
    }

    const current =
      generation.current;

    folderBusy.current = true;

    try {
      await repository.addConversationToFolder(
        userId,
        folderId,
        conversationId
      );

      if (
        current !==
        generation.current
      ) {
        return false;
      }

      setFolders((items) =>
        items.map((item) =>
          item.id !== folderId
            ? item
            : {
                ...item,

                conversationIds: [
                  ...item.conversationIds,
                  conversationId,
                ],
              }
        )
      );

      return true;
    } catch (cause) {
      if (
        current ===
        generation.current
      ) {
        console.error(
          "Add conversation to folder failed",
          cause
        );

        setError(
          "無法將對話加入資料夾，請稍後再試。"
        );
      }

      return false;
    } finally {
      if (
        current ===
        generation.current
      ) {
        folderBusy.current =
          false;
      }
    }
  }

  /*
   * 只從資料夾移除 conversation。
   *
   * 不刪除原始 conversation，
   * 也不刪 messages。
   */
  async function removeConversationFromFolder(
    folderId: string,
    conversationId: string
  ): Promise<boolean> {
    if (
      !userId ||
      !ready ||
      folderBusy.current
    ) {
      return false;
    }

    const current =
      generation.current;

    folderBusy.current = true;

    try {
      await repository.removeConversationFromFolder(
        userId,
        folderId,
        conversationId
      );

      if (
        current !==
        generation.current
      ) {
        return false;
      }

      setFolders((items) =>
        items.map((item) =>
          item.id !== folderId
            ? item
            : {
                ...item,

                conversationIds:
                  item.conversationIds.filter(
                    (id) =>
                      id !==
                      conversationId
                  ),
              }
        )
      );

      return true;
    } catch (cause) {
      if (
        current ===
        generation.current
      ) {
        console.error(
          "Remove conversation from folder failed",
          cause
        );

        setError(
          "無法將對話移出資料夾，請稍後再試。"
        );
      }

      return false;
    } finally {
      if (
        current ===
        generation.current
      ) {
        folderBusy.current =
          false;
      }
    }
  }

  /*
   * 永久刪除 conversation。
   *
   * repository 會：
   * 1. 刪除 messages
   * 2. 刪除 conversation
   *
   * folder 關聯會因 DB cascade
   * 一起被清掉。
   */
  async function deleteConversation(
    conversationId: string
  ): Promise<boolean> {
    if (
      !userId ||
      !ready ||
      busy.current.size > 0 ||
      failedWrites.current
        .size > 0 ||
      folderBusy.current
    ) {
      return false;
    }

    const current =
      generation.current;

    folderBusy.current = true;

    try {
      await repository.deleteConversation(
        userId,
        conversationId
      );

      if (
        current !==
        generation.current
      ) {
        return false;
      }

      let nextConversations:
        Conversation[] = [];

      setConversations(
        (items) => {
          nextConversations =
            items.filter(
              (item) =>
                item.id !==
                conversationId
            );

          return nextConversations;
        }
      );

      /*
       * 同步清掉所有 folder 裡的連結。
       */
      setFolders((items) =>
        items.map((folder) => ({
          ...folder,

          conversationIds:
            folder.conversationIds.filter(
              (id) =>
                id !==
                conversationId
            ),
        }))
      );

      /*
       * 如果刪掉的就是目前開啟的 conversation，
       * 自動切到下一筆。
       */
      if (
        activeConversationId ===
        conversationId
      ) {
        const remaining =
          conversations.filter(
            (item) =>
              item.id !==
              conversationId
          );

        setActiveConversationId(
          remaining[0]?.id ??
            null
        );
      }

      return true;
    } catch (cause) {
      if (
        current ===
        generation.current
      ) {
        console.error(
          "Delete conversation failed",
          cause
        );

        setError(
          "無法永久刪除對話，請稍後再試。"
        );
      }

      return false;
    } finally {
      if (
        current ===
        generation.current
      ) {
        folderBusy.current =
          false;
      }
    }
  }

  /*
   * 產生 AI 短標題並存到 Supabase。
   */
  async function generateConversationTitle(
    ownerId: string,
    conversationId: string,
    question: string,
    current: number
  ) {
    const fallbackTitle =
      question.length > 14
        ? `${question.slice(
            0,
            14
          )}…`
        : question;

    let title =
      fallbackTitle;

    try {
      const response =
        await fetch(
          "/api/chat/title",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                message:
                  question,
              }),
          }
        );

      if (!response.ok) {
        throw new Error(
          "Failed to generate title"
        );
      }

      const data =
        await response.json();

      if (
        typeof data.title ===
          "string" &&
        data.title.trim()
      ) {
        title =
          data.title.trim();
      }
    } catch (cause) {
      console.error(
        "Title generation failed",
        cause
      );
    }

    if (
      current !==
      generation.current
    ) {
      return;
    }

    try {
      await repository.title(
        ownerId,
        conversationId,
        title
      );

      if (
        current !==
        generation.current
      ) {
        return;
      }

      setConversations(
        (items) =>
          items.map(
            (item) =>
              item.id ===
              conversationId
                ? {
                    ...item,
                    title,
                  }
                : item
          )
      );
    } catch (cause) {
      console.error(
        "Save conversation title failed",
        cause
      );

      if (
        current ===
          generation.current &&
        !failedWrites.current
          .size
      ) {
        setError(
          "對話內容已儲存，但短標題未更新。"
        );
      }
    }
  }

  /*
   * 儲存問題
   * → AI 回答
   * → 儲存回答
   * → 第一輪產生短標題。
   */
  async function sendMessage(
    question: string
  ): Promise<boolean> {
    question =
      question.trim();

    if (
      !userId ||
      !ready ||
      !question ||
      failedWrites.current
        .size > 0
    ) {
      return false;
    }

    const current =
      generation.current;

    let id =
      activeConversationId;

    const lockId =
      id ?? "draft";

    if (
      busy.current.has(
        lockId
      )
    ) {
      return false;
    }

    setError("");

    busy.current.add(
      lockId
    );

    setBusyIds([
      ...busy.current,
    ]);

    try {
      const existing =
        conversations.find(
          (item) =>
            item.id === id
        );

      const shouldGenerateTitle =
        !id ||
        (
          existing?.title ===
            "新問題" &&
          existing.messages
            .length === 0
        );

      /*
       * 沒有 active conversation 時，
       * 第一題自動建立。
       */
      if (!id) {
        const fallbackTitle =
          question.length > 14
            ? `${question.slice(
                0,
                14
              )}…`
            : question;

        const created =
          await createConversation(
            fallbackTitle
          );

        if (
          !created ||
          current !==
            generation.current
        ) {
          return false;
        }

        id =
          created.id;

        busy.current.add(
          id
        );

        setBusyIds([
          ...busy.current,
        ]);
      }

      if (!id) {
        return false;
      }

      const conversationId:
        string = id;

      const userMessage:
        StoredMessage = {
        id:
          crypto.randomUUID(),

        conversation_id:
          conversationId,

        user_id:
          userId,

        role:
          "user",

        content:
          question,

        created_at:
          new Date().toISOString(),
      };

      /*
       * 問題先存成功才呼叫 AI。
       */
      await repository.saveMessage(
        userMessage
      );

      if (
        current !==
        generation.current
      ) {
        return true;
      }

      const replyId =
        crypto.randomUUID();

      /*
       * 前端先顯示 user message
       * + pending assistant。
       */
      setConversations(
        (items) =>
          items.map(
            (item) =>
              item.id !==
              conversationId
                ? item
                : {
                    ...item,

                    updatedAt:
                      userMessage.created_at,

                    messages: [
                      ...item.messages,

                      {
                        id:
                          userMessage.id,

                        role:
                          "user",

                        content:
                          question,
                      },

                      {
                        id:
                          replyId,

                        role:
                          "assistant",

                        content:
                          "",

                        pending:
                          true,
                      },
                    ],
                  }
          )
      );

      let reply: string;

      try {
        const response =
          await fetch(
            "/api/chat",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify(
                  {
                    message:
                      question,
                  }
                ),
            }
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          typeof data.reply !==
            "string" ||
          !data.reply.trim()
        ) {
          throw new Error(
            "AI request failed"
          );
        }

        reply =
          data.reply;
      } catch (cause) {
        console.error(
          "Chat request failed",
          cause
        );

        reply =
          "目前無法取得 AI 回覆，請稍後再試一次。";
      }

      if (
        current !==
        generation.current
      ) {
        return true;
      }

      const assistantMessage:
        StoredMessage = {
        id:
          replyId,

        conversation_id:
          conversationId,

        user_id:
          userId,

        role:
          "assistant",

        content:
          reply,

        created_at:
          new Date().toISOString(),
      };

      /*
       * 把 pending assistant
       * 換成正式回答。
       */
      setConversations(
        (items) =>
          items.map(
            (item) =>
              item.id !==
              conversationId
                ? item
                : {
                    ...item,

                    updatedAt:
                      assistantMessage.created_at,

                    messages:
                      item.messages.map(
                        (
                          message
                        ) =>
                          message.id !==
                          replyId
                            ? message
                            : {
                                id:
                                  replyId,

                                role:
                                  "assistant",

                                content:
                                  reply,
                              }
                      ),
                  }
          )
      );

      /*
       * 儲存 AI 回答。
       */
      try {
        await repository.saveMessage(
          assistantMessage
        );
      } catch (cause) {
        if (
          current !==
          generation.current
        ) {
          return true;
        }

        console.error(
          "Save reply failed",
          cause
        );

        failedWrites.current.set(
          replyId,
          assistantMessage
        );

        setUnsavedCount(
          failedWrites.current
            .size
        );

        setError(
          "AI 回覆尚未存入雲端。請按「重試儲存」，成功前不要重新整理或登出。"
        );
      }

      /*
       * 第一輪產生 AI 短標題。
       */
      if (
        shouldGenerateTitle &&
        current ===
          generation.current
      ) {
        await generateConversationTitle(
          userId,
          conversationId,
          question,
          current
        );
      }

      return true;
    } catch (cause) {
      if (
        current ===
        generation.current
      ) {
        console.error(
          "Save question failed",
          cause
        );

        setError(
          "問題未存成功，尚未送給 AI。請確認網路後重新送出。"
        );
      }

      return false;
    } finally {
      if (
        current ===
        generation.current
      ) {
        busy.current.delete(
          lockId
        );

        if (id) {
          busy.current.delete(
            id
          );
        }

        setBusyIds([
          ...busy.current,
        ]);
      }
    }
  }

  /*
   * 使用相同 message ID
   * 重試失敗寫入。
   */
  async function retrySaving() {
    if (
      !ready ||
      retrying.current
    ) {
      return;
    }

    const current =
      generation.current;

    retrying.current = true;

    try {
      for (
        const [
          id,
          row,
        ] of
        failedWrites.current
      ) {
        if (
          current !==
          generation.current
        ) {
          return;
        }

        await repository.saveMessage(
          row
        );

        if (
          current !==
          generation.current
        ) {
          return;
        }

        failedWrites.current.delete(
          id
        );

        setUnsavedCount(
          failedWrites.current
            .size
        );
      }

      if (
        current ===
        generation.current
      ) {
        setError("");
      }
    } catch (cause) {
      if (
        current ===
        generation.current
      ) {
        console.error(
          "Retry save failed",
          cause
        );

        setError(
          "仍無法儲存，請確認網路與 Supabase 權限後重試。"
        );
      }
    } finally {
      if (
        current ===
        generation.current
      ) {
        retrying.current =
          false;
      }
    }
  }

  function reload() {
    if (
      busy.current.size >
        0 ||
      failedWrites.current
        .size > 0 ||
      creating.current ||
      retrying.current ||
      folderBusy.current
    ) {
      return;
    }

    setReloadVersion(
      (value) =>
        value + 1
    );
  }

  return {
    /*
     * Cloud data
     */
    conversations:
      ready
        ? conversations
        : [],

    folders:
      ready
        ? folders
        : [],

    activeConversationId:
      ready
        ? activeConversationId
        : null,

    setActiveConversationId,

    /*
     * Status
     */
    loading,

    ready,

    error,

    busy:
      busyIds.includes(
        activeConversationId ??
          "draft"
      ),

    busyAny:
      busyIds.length > 0,

    unsavedCount,

    /*
     * Conversation actions
     */
    createConversation,

    deleteConversation,

    sendMessage,

    /*
     * Folder actions
     */
    createFolder,

    addConversationToFolder,

    removeConversationFromFolder,

    /*
     * Recovery
     */
    retrySaving,

    reload,
  };
}