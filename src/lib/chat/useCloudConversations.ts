"use client";

import { useEffect, useRef, useState } from "react";
import {
  supabase,
  getValidSession,
} from "@/lib/supabase";
import type { Conversation } from "@/lib/types";
import {
  createChatRepository,
  type ChatFolder,
  type StoredMessage,
} from "./repository";

const repository = createChatRepository(supabase);

function getErrorMessage(cause: unknown) {
  if (cause instanceof Error) return cause.message;

  if (
    cause &&
    typeof cause === "object" &&
    "message" in cause
  ) {
    return String(cause.message);
  }

  return "操作失敗，請稍後再試。";
}

function fallbackTitle(question: string) {
  return question.length > 14
    ? `${question.slice(0, 14)}…`
    : question;
}

export function useCloudConversations(
  userId: string | null
) {
  const [conversations, setConversations] =
    useState<Conversation[]>([]);
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [activeConversationId, setActiveConversationId] =
    useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [unsavedCount, setUnsavedCount] = useState(0);
  const [reloadVersion, setReloadVersion] = useState(0);

  const generation = useRef(0);
  const busy = useRef(new Set<string>());
  const failedWrites = useRef(
    new Map<string, StoredMessage>()
  );

  const creating = useRef(false);
  const retrying = useRef(false);
  const folderBusy = useRef(false);
  const loadedOwner = useRef<string | null>(null);

  useEffect(() => {
    const current = ++generation.current;

    loadedOwner.current = null;
    busy.current = new Set();
    failedWrites.current = new Map();
    creating.current = false;
    retrying.current = false;
    folderBusy.current = false;

    setConversations([]);
    setFolders([]);
    setActiveConversationId(null);
    setBusyIds([]);
    setUnsavedCount(0);
    setError("");
    setLoading(Boolean(userId));

    if (userId) {
      const ownerId = userId;

      void (async () => {
        try {
          await getValidSession(ownerId);

          if (current !== generation.current) return;

          const [conversationItems, folderItems] =
            await Promise.all([
              repository.load(ownerId),
              repository.loadFolders(ownerId),
            ]);

          if (current !== generation.current) return;

          loadedOwner.current = ownerId;
          setConversations(conversationItems);
          setFolders(folderItems);
          setActiveConversationId(
            conversationItems[0]?.id ?? null
          );
        } catch (cause) {
          if (current !== generation.current) return;

          setError(
            `無法讀取雲端對話：${getErrorMessage(cause)}`
          );
        } finally {
          if (current === generation.current) {
            setLoading(false);
          }
        }
      })();
    }

    return () => {
      generation.current++;
    };
  }, [userId, reloadVersion]);

  const ready = Boolean(
    userId &&
      loadedOwner.current === userId &&
      !loading
  );

  async function ensureSession(
    ownerId: string,
    current: number
  ) {
    if (current !== generation.current) {
      throw new Error("登入狀態已變更。");
    }

    await getValidSession(ownerId);

    if (current !== generation.current) {
      throw new Error("登入狀態已變更。");
    }
  }

  // 聊天與標題共用：
  // 檢查憑證，收到 401 後更新憑證並重試一次。
  async function callChatApi(
    path: "/api/chat" | "/api/chat/title",
    ownerId: string,
    question: string,
    current: number
  ): Promise<Record<string, unknown>> {
    function checkCurrent() {
      if (current !== generation.current) {
        throw new Error("登入狀態已變更。");
      }
    }

    checkCurrent();

    let session = await getValidSession(ownerId);

    checkCurrent();

    const controller = new AbortController();
    const timer = window.setTimeout(
      () => controller.abort(),
      55_000
    );

    try {
      async function send(accessToken: string) {
        return fetch(path, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            message: question,
          }),
          signal: controller.signal,
        });
      }

      let response = await send(session.access_token);

      checkCurrent();

      if (response.status === 401) {
        session = await getValidSession(ownerId, true);

        checkCurrent();

        response = await send(session.access_token);
      }

      const result: unknown = await response
        .json()
        .catch(() => null);

      checkCurrent();

      const data =
        result &&
        typeof result === "object" &&
        !Array.isArray(result)
          ? (result as Record<string, unknown>)
          : null;

      if (response.status === 401) {
        throw new Error("登入已失效，請重新登入。");
      }

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : `請求失敗（${response.status}），請稍後重試。`
        );
      }

      if (!data) {
        throw new Error("伺服器回傳格式不正確。");
      }

      return data;
    } catch (cause) {
      if (controller.signal.aborted) {
        throw new Error("AI 回覆逾時，請稍後再試。");
      }

      throw cause;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function createConversation(title = "新問題") {
    if (!userId || !ready || creating.current) {
      return null;
    }

    const current = generation.current;
    creating.current = true;

    try {
      await ensureSession(userId, current);

      const conversation = await repository.create(
        userId,
        title
      );

      if (current !== generation.current) return null;

      setConversations((items) => [
        conversation,
        ...items,
      ]);
      setActiveConversationId(conversation.id);

      return conversation;
    } catch (cause) {
      if (current === generation.current) {
        setError(
          `新對話建立失敗：${getErrorMessage(cause)}`
        );
      }

      return null;
    } finally {
      if (current === generation.current) {
        creating.current = false;
      }
    }
  }

  async function createFolder(
    name: string
  ): Promise<ChatFolder | null> {
    const trimmedName = name.trim();

    if (
      !userId ||
      !ready ||
      !trimmedName ||
      folderBusy.current
    ) {
      return null;
    }

    const current = generation.current;
    folderBusy.current = true;

    try {
      await ensureSession(userId, current);

      const folder = await repository.createFolder(
        userId,
        trimmedName
      );

      if (current !== generation.current) return null;

      setFolders((items) => [folder, ...items]);

      return folder;
    } catch (cause) {
      if (current === generation.current) {
        setError(
          `資料夾建立失敗：${getErrorMessage(cause)}`
        );
      }

      return null;
    } finally {
      if (current === generation.current) {
        folderBusy.current = false;
      }
    }
  }

  async function addConversationToFolder(
    folderId: string,
    conversationId: string
  ): Promise<boolean> {
    if (!userId || !ready || folderBusy.current) {
      return false;
    }

    const folder = folders.find(
      (item) => item.id === folderId
    );
    const conversationExists = conversations.some(
      (item) => item.id === conversationId
    );

    if (!folder || !conversationExists) return false;

    if (folder.conversationIds.includes(conversationId)) {
      return true;
    }

    const current = generation.current;
    folderBusy.current = true;

    try {
      await ensureSession(userId, current);

      await repository.addConversationToFolder(
        userId,
        folderId,
        conversationId
      );

      if (current !== generation.current) return false;

      setFolders((items) =>
        items.map((item) =>
          item.id !== folderId
            ? item
            : {
                ...item,
                conversationIds: Array.from(
                  new Set([
                    ...item.conversationIds,
                    conversationId,
                  ])
                ),
              }
        )
      );

      return true;
    } catch (cause) {
      if (current === generation.current) {
        setError(
          `無法加入資料夾：${getErrorMessage(cause)}`
        );
      }

      return false;
    } finally {
      if (current === generation.current) {
        folderBusy.current = false;
      }
    }
  }

  async function removeConversationFromFolder(
    folderId: string,
    conversationId: string
  ): Promise<boolean> {
    if (!userId || !ready || folderBusy.current) {
      return false;
    }

    const current = generation.current;
    folderBusy.current = true;

    try {
      await ensureSession(userId, current);

      await repository.removeConversationFromFolder(
        userId,
        folderId,
        conversationId
      );

      if (current !== generation.current) return false;

      setFolders((items) =>
        items.map((item) =>
          item.id !== folderId
            ? item
            : {
                ...item,
                conversationIds:
                  item.conversationIds.filter(
                    (id) => id !== conversationId
                  ),
              }
        )
      );

      return true;
    } catch (cause) {
      if (current === generation.current) {
        setError(
          `無法移出資料夾：${getErrorMessage(cause)}`
        );
      }

      return false;
    } finally {
      if (current === generation.current) {
        folderBusy.current = false;
      }
    }
  }

  async function deleteConversation(
    conversationId: string
  ): Promise<boolean> {
    if (
      !userId ||
      !ready ||
      busy.current.size > 0 ||
      failedWrites.current.size > 0 ||
      creating.current ||
      folderBusy.current
    ) {
      return false;
    }

    const current = generation.current;
    folderBusy.current = true;

    try {
      await ensureSession(userId, current);

      await repository.deleteConversation(
        userId,
        conversationId
      );

      if (current !== generation.current) return false;

      const remaining = conversations.filter(
        (item) => item.id !== conversationId
      );

      setConversations((items) =>
        items.filter((item) => item.id !== conversationId)
      );

      setFolders((items) =>
        items.map((folder) => ({
          ...folder,
          conversationIds: folder.conversationIds.filter(
            (id) => id !== conversationId
          ),
        }))
      );

      setActiveConversationId((activeId) =>
        activeId === conversationId
          ? remaining[0]?.id ?? null
          : activeId
      );

      return true;
    } catch (cause) {
      if (current === generation.current) {
        setError(
          `無法刪除對話：${getErrorMessage(cause)}`
        );
      }

      return false;
    } finally {
      if (current === generation.current) {
        folderBusy.current = false;
      }
    }
  }

  async function generateConversationTitle(
    ownerId: string,
    conversationId: string,
    question: string,
    current: number
  ) {
    if (current !== generation.current) return;

    let title = fallbackTitle(question);

    try {
      const data = await callChatApi(
        "/api/chat/title",
        ownerId,
        question,
        current
      );

      if (
        typeof data.title === "string" &&
        data.title.trim()
      ) {
        title = data.title.trim();
      }
    } catch {
      // 標題 API 失敗時，使用問題前十四字。
    }

    if (current !== generation.current) return;

    try {
      await ensureSession(ownerId, current);

      await repository.title(
        ownerId,
        conversationId,
        title
      );

      if (current !== generation.current) return;

      setConversations((items) =>
        items.map((item) =>
          item.id === conversationId
            ? { ...item, title }
            : item
        )
      );
    } catch (cause) {
      if (current !== generation.current) return;

      if (!failedWrites.current.size) {
        setError(
          `對話內容已儲存，但標題未更新：${getErrorMessage(cause)}`
        );
      }
    }
  }

  async function sendMessage(
    question: string
  ): Promise<boolean> {
    question = question.trim();

    if (!question) return false;

    if (!userId) {
      setError("請先登入再送出問題。");
      return false;
    }

    if (!ready) {
      setError((previous) =>
        previous ||
        (loading
          ? "對話資料仍在載入，請稍後再試。"
          : "對話資料未載入成功，請重新載入對話。")
      );
      return false;
    }

    if (failedWrites.current.size > 0) {
      setError("有尚未儲存的回答，請先按「重試儲存」。");
      return false;
    }

    if (folderBusy.current) {
      setError("資料夾操作尚未完成，請稍後再送出。");
      return false;
    }

    if (question.length > 8000) {
      setError("每則問題最多 8,000 字，請縮短後再送出。");
      return false;
    }

    const ownerId = userId;
    const current = generation.current;
    let id = activeConversationId;
    const lockId = id ?? "draft";

    if (busy.current.has(lockId)) return false;

    setError("");
    busy.current.add(lockId);
    setBusyIds([...busy.current]);

    try {
      // 建立對話與儲存問題前，先檢查登入憑證。
      await ensureSession(ownerId, current);

      const existing = conversations.find(
        (item) => item.id === id
      );

      const shouldGenerateTitle =
        !id ||
        (existing?.title === "新問題" &&
          existing.messages.length === 0);

      if (!id) {
        const created = await createConversation(
          fallbackTitle(question)
        );

        if (
          !created ||
          current !== generation.current
        ) {
          return false;
        }

        id = created.id;
        busy.current.add(id);
        setBusyIds([...busy.current]);
      }

      if (!id) return false;

      const conversationId = id;

      const userMessage: StoredMessage = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        user_id: ownerId,
        role: "user",
        content: question,
        created_at: new Date().toISOString(),
      };

      // 問題成功儲存後，才送給 AI。
      await repository.saveMessage(userMessage);

      if (current !== generation.current) return true;

      const replyId = crypto.randomUUID();

      setConversations((items) =>
        items.map((item) =>
          item.id !== conversationId
            ? item
            : {
                ...item,
                updatedAt: userMessage.created_at,
                messages: [
                  ...item.messages,
                  {
                    id: userMessage.id,
                    role: "user",
                    content: question,
                  },
                  {
                    id: replyId,
                    role: "assistant",
                    content: "",
                    pending: true,
                  },
                ],
              }
        )
      );

      let reply: string;

      try {
        const data = await callChatApi(
          "/api/chat",
          ownerId,
          question,
          current
        );

        if (
          typeof data.reply !== "string" ||
          !data.reply.trim()
        ) {
          throw new Error("AI 沒有回傳有效回答，請重試。");
        }

        reply = data.reply.trim();
      } catch (cause) {
        if (current !== generation.current) return true;

        // 移除等待中的回答，保留已儲存的問題。
        setConversations((items) =>
          items.map((item) =>
            item.id !== conversationId
              ? item
              : {
                  ...item,
                  messages: item.messages.filter(
                    (message) => message.id !== replyId
                  ),
                }
          )
        );

        setError(
          `問題已存入雲端，但未取得 AI 回覆：${getErrorMessage(cause)}`
        );

        return true;
      }

      if (current !== generation.current) return true;

      const assistantMessage: StoredMessage = {
        id: replyId,
        conversation_id: conversationId,
        user_id: ownerId,
        role: "assistant",
        content: reply,
        created_at: new Date().toISOString(),
      };

      setConversations((items) =>
        items.map((item) =>
          item.id !== conversationId
            ? item
            : {
                ...item,
                updatedAt: assistantMessage.created_at,
                messages: item.messages.map((message) =>
                  message.id !== replyId
                    ? message
                    : {
                        id: replyId,
                        role: "assistant",
                        content: reply,
                      }
                ),
              }
        )
      );

      try {
        await ensureSession(ownerId, current);
        await repository.saveMessage(assistantMessage);
      } catch (cause) {
        if (current !== generation.current) return true;

        failedWrites.current.set(
          replyId,
          assistantMessage
        );
        setUnsavedCount(failedWrites.current.size);

        setError(
          "AI 回覆尚未存入雲端，請按「重試儲存」。" +
            `原因：${getErrorMessage(cause)}`
        );
      }

      if (
        shouldGenerateTitle &&
        current === generation.current
      ) {
        await generateConversationTitle(
          ownerId,
          conversationId,
          question,
          current
        );
      }

      return true;
    } catch (cause) {
      if (current === generation.current) {
        setError(
          `問題未存成功，尚未送給 AI：${getErrorMessage(cause)}`
        );
      }

      return false;
    } finally {
      if (current === generation.current) {
        busy.current.delete(lockId);

        if (id) busy.current.delete(id);

        setBusyIds([...busy.current]);
      }
    }
  }

  async function retrySaving() {
    if (!userId || !ready || retrying.current) return;

    const current = generation.current;
    retrying.current = true;

    try {
      await ensureSession(userId, current);

      for (const [id, row] of failedWrites.current) {
        if (current !== generation.current) return;

        await repository.saveMessage(row);

        if (current !== generation.current) return;

        failedWrites.current.delete(id);
        setUnsavedCount(failedWrites.current.size);
      }

      if (current === generation.current) {
        setError("");
      }
    } catch (cause) {
      if (current === generation.current) {
        setError(
          `仍無法儲存：${getErrorMessage(cause)}`
        );
      }
    } finally {
      if (current === generation.current) {
        retrying.current = false;
      }
    }
  }

  function reload() {
    if (
      busy.current.size > 0 ||
      failedWrites.current.size > 0 ||
      creating.current ||
      retrying.current ||
      folderBusy.current
    ) {
      return;
    }

    setReloadVersion((value) => value + 1);
  }

  return {
    conversations: ready ? conversations : [],
    folders: ready ? folders : [],
    activeConversationId:
      ready ? activeConversationId : null,

    setActiveConversationId,

    loading,
    ready,
    error,

    busy: busyIds.includes(
      activeConversationId ?? "draft"
    ),
    busyAny: busyIds.length > 0,
    unsavedCount,

    createConversation,
    deleteConversation,
    sendMessage,

    createFolder,
    addConversationToFolder,
    removeConversationFromFolder,

    retrySaving,
    reload,
  };
}