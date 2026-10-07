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
    activeConversationId,
    setActiveConversationId,
  ] = useState<string | null>(null);

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

  const loadedOwner =
    useRef<string | null>(
      null
    );

  /*
   * 登入或切換帳號後，
   * 從 Supabase 讀取該帳號的對話。
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

    setConversations([]);

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

    repository
      .load(userId)
      .then((items) => {
        if (
          current !==
          generation.current
        ) {
          return;
        }

        loadedOwner.current =
          userId;

        setConversations(
          items
        );

        setActiveConversationId(
          items[0]?.id ??
            null
        );

        setLoading(false);
      })
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
            "Load conversations failed",
            cause
          );

          setError(
            "無法讀取雲端對話。請確認 Supabase 資料表與權限設定，再重試。"
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
   * 建立新對話並選取。
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
   * 產生 AI 短標題，
   * 並存回 Supabase。
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
   * 流程：
   *
   * 儲存問題
   * → 呼叫 AI
   * → 儲存回答
   * → 第一輪產生短標題
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
       * 如果目前沒有 active conversation，
       * 第一題送出時自動建立。
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

      /*
       * 這個 guard 是給 TypeScript
       * 明確知道 id 從這裡開始一定是 string。
       */
      if (!id) {
        return false;
      }

      const conversationId: string =
        id;

      const userMessage: StoredMessage =
        {
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
       * 問題先存成功，
       * 才呼叫 AI。
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
       * 先把 user message
       * 和 pending assistant
       * 放進前端畫面。
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

      /*
       * 避免舊帳號的 AI 回覆
       * 更新到新帳號。
       */
      if (
        current !==
        generation.current
      ) {
        return true;
      }

      const assistantMessage: StoredMessage =
        {
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
       * 換成真正回答。
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
       * 只在第一輪對話
       * 產生 AI 短標題。
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
   * 重試失敗的雲端寫入，
   * 避免產生重複回答。
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
      retrying.current
    ) {
      return;
    }

    setReloadVersion(
      (value) =>
        value + 1
    );
  }

  return {
    conversations:
      ready
        ? conversations
        : [],

    activeConversationId:
      ready
        ? activeConversationId
        : null,

    setActiveConversationId,

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

    createConversation,

    sendMessage,

    retrySaving,

    reload,
  };
}