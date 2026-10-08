"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, getValidSession } from "@/lib/supabase";
import type { Conversation } from "@/lib/types";
import {
  createChatRepository,
  type ChatFolder,
  type StoredMessage,
} from "./repository";

const repository = createChatRepository(supabase);

const MAX_MESSAGE_LENGTH = 8_000;
const REQUEST_TIMEOUT_MS = 70_000;
const DRAFT_STORAGE_PREFIX = "next-ntu:unsaved-replies:v1:";

function getErrorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }

  if (
    cause &&
    typeof cause === "object" &&
    "message" in cause &&
    typeof cause.message === "string"
  ) {
    return cause.message;
  }

  return "操作失敗，請稍後再試。";
}

function asRecord(
  value: unknown
): Record<string, unknown> | null {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  return null;
}

function fallbackTitle(question: string): string {
  const text = question.replace(/\s+/g, " ").trim();
  const characters = Array.from(text);

  return characters.length > 14
    ? `${characters.slice(0, 14).join("")}…`
    : text || "新問題";
}

function draftStorageKey(ownerId: string): string {
  return `${DRAFT_STORAGE_PREFIX}${ownerId}`;
}

function readDrafts(ownerId: string): StoredMessage[] {
  try {
    const raw = window.sessionStorage.getItem(
      draftStorageKey(ownerId)
    );

    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const rows: StoredMessage[] = [];

    for (const item of parsed) {
      const row = asRecord(item);

      if (
        !row ||
        typeof row.id !== "string" ||
        !row.id ||
        typeof row.conversation_id !== "string" ||
        !row.conversation_id ||
        row.user_id !== ownerId ||
        row.role !== "assistant" ||
        typeof row.content !== "string" ||
        !row.content.trim() ||
        typeof row.created_at !== "string" ||
        !Number.isFinite(Date.parse(row.created_at))
      ) {
        continue;
      }

      rows.push({
        id: row.id,
        conversation_id: row.conversation_id,
        user_id: ownerId,
        role: "assistant",
        content: row.content,
        created_at: row.created_at,
      });
    }

    return rows;
  } catch {
    return [];
  }
}

function writeDrafts(
  ownerId: string,
  rows: StoredMessage[]
): boolean {
  try {
    const key = draftStorageKey(ownerId);

    if (rows.length === 0) {
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, JSON.stringify(rows));
    }

    return true;
  } catch {
    return false;
  }
}

export function useCloudConversations(userId: string | null) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [activeConversationId, setActiveConversationId] =
    useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [unsavedCount, setUnsavedCount] = useState(0);
  const [reloadVersion, setReloadVersion] = useState(0);

  const generation = useRef(0);
  const loadedOwner = useRef<string | null>(null);

  const conversationItems = useRef<Conversation[]>([]);
  const folderItems = useRef<ChatFolder[]>([]);

  const busy = useRef(new Set<string>());
  const requests = useRef(new Set<AbortController>());
  const failedWrites = useRef(new Map<string, StoredMessage>());

  const creating = useRef(false);
  const retrying = useRef(false);
  const folderBusy = useRef(false);
  const updatingTitles = useRef(new Set<string>());

  function updateConversations(
    update: (items: Conversation[]) => Conversation[]
  ) {
    const next = update(conversationItems.current);
    conversationItems.current = next;
    setConversations(next);
  }

  function updateFolders(
    update: (items: ChatFolder[]) => ChatFolder[]
  ) {
    const next = update(folderItems.current);
    folderItems.current = next;
    setFolders(next);
  }

  function checkCurrent(current: number) {
    if (current !== generation.current) {
      throw new Error("登入狀態已變更。");
    }
  }

  async function ensureSession(
    ownerId: string,
    current: number
  ) {
    checkCurrent(current);
    await getValidSession(ownerId);
    checkCurrent(current);
  }

  function persistDrafts(ownerId: string): boolean {
    return writeDrafts(
      ownerId,
      Array.from(failedWrites.current.values())
    );
  }

  useEffect(() => {
    const current = ++generation.current;

    for (const controller of requests.current) {
      controller.abort();
    }

    requests.current.clear();
    busy.current.clear();
    failedWrites.current.clear();
    updatingTitles.current.clear();

    loadedOwner.current = null;
    conversationItems.current = [];
    folderItems.current = [];

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

          if (current !== generation.current) {
            return;
          }

          const [loadedConversations, loadedFolders] =
            await Promise.all([
              repository.load(ownerId),
              repository.loadFolders(ownerId),
            ]);

          if (current !== generation.current) {
            return;
          }

          const cachedRows = readDrafts(ownerId);
          const pending = new Map<string, StoredMessage>();

          // 已經存在於雲端的回答，不再列入重試清單。
          for (const row of cachedRows) {
            const conversation = loadedConversations.find(
              (item) => item.id === row.conversation_id
            );

            const alreadySaved = conversation?.messages.some(
              (message) => message.id === row.id
            );

            if (!alreadySaved) {
              pending.set(row.id, row);
            }
          }

          const restoredConversations: Conversation[] =
            loadedConversations.map((conversation) => {
              const restoredRows = Array.from(pending.values())
                .filter(
                  (row) =>
                    row.conversation_id === conversation.id
                )
                .sort((a, b) =>
                  a.created_at.localeCompare(b.created_at)
                );

              if (restoredRows.length === 0) {
                return conversation;
              }

              return {
                ...conversation,
                messages: [
                  ...conversation.messages,
                  ...restoredRows.map((row) => ({
                    id: row.id,
                    role: "assistant" as const,
                    content: row.content,
                    pending: false,
                  })),
                ],
              };
            });

          failedWrites.current = pending;
          writeDrafts(ownerId, Array.from(pending.values()));

          conversationItems.current = restoredConversations;
          folderItems.current = loadedFolders;
          loadedOwner.current = ownerId;

          setConversations(restoredConversations);
          setFolders(loadedFolders);
          setUnsavedCount(pending.size);

          setActiveConversationId(
            restoredConversations[0]?.id ?? null
          );

          if (pending.size > 0) {
            setError(
              "已復原尚未存入雲端的回答，請按「重試儲存」。"
            );
          }
        } catch (cause) {
          if (current === generation.current) {
            setError(
              `無法讀取雲端對話：${getErrorMessage(cause)}`
            );
          }
        } finally {
          if (current === generation.current) {
            setLoading(false);
          }
        }
      })();
    }

    return () => {
      generation.current++;

      for (const controller of requests.current) {
        controller.abort();
      }

      requests.current.clear();
    };
  }, [userId, reloadVersion]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (
        busy.current.size === 0 &&
        failedWrites.current.size === 0 &&
        !creating.current &&
        !retrying.current
      ) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener(
        "beforeunload",
        handleBeforeUnload
      );
    };
  }, []);

  const ready = Boolean(
    userId &&
      loadedOwner.current === userId &&
      !loading
  );

  async function callChatApi(
    ownerId: string,
    question: string,
    current: number,
    onText: (text: string) => void
  ): Promise<string> {
    checkCurrent(current);

    let session = await getValidSession(ownerId);
    checkCurrent(current);

    const controller = new AbortController();
    requests.current.add(controller);

    let timedOut = false;

    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      async function send(accessToken: string) {
        checkCurrent(current);

        return fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            message: question,
            stream: true,
          }),
          signal: controller.signal,
          cache: "no-store",
        });
      }

      let response = await send(session.access_token);
      checkCurrent(current);

      // 僅在尚未讀取回答且收到 401 時，更新憑證並重試一次。
      if (response.status === 401) {
        try {
          await response.body?.cancel();
        } catch {
          // 回應可能已經關閉。
        }

        session = await getValidSession(ownerId, true);
        checkCurrent(current);

        response = await send(session.access_token);
        checkCurrent(current);
      }

      if (!response.ok) {
        const result: unknown = await response
          .json()
          .catch(() => null);

        checkCurrent(current);

        const data = asRecord(result);

        if (response.status === 401) {
          throw new Error("登入已失效，請重新登入。");
        }

        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : `請求失敗（${response.status}），請稍後重試。`
        );
      }

      const contentType =
        response.headers.get("content-type")?.toLowerCase() ?? "";

      // 相容目前仍回傳 { reply } 的非串流後端。
      if (!contentType.includes("application/x-ndjson")) {
        const result: unknown = await response
          .json()
          .catch(() => null);

        checkCurrent(current);

        const data = asRecord(result);

        if (typeof data?.error === "string") {
          throw new Error(data.error);
        }

        if (
          typeof data?.reply !== "string" ||
          !data.reply.trim()
        ) {
          throw new Error("伺服器沒有回傳有效回答。");
        }

        const reply = data.reply.trim();
        onText(reply);
        return reply;
      }

      if (!response.body) {
        throw new Error("伺服器沒有提供串流內容。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";
      let accumulated = "";
      let finalReply: string | null = null;
      let lastDisplayed = "";

      function consumeLine(line: string) {
        checkCurrent(current);

        const trimmed = line.trim();

        if (!trimmed) {
          return;
        }

        let parsed: unknown;

        try {
          parsed = JSON.parse(trimmed);
        } catch {
          throw new Error("AI 串流格式不正確，請重試。");
        }

        const event = asRecord(parsed);

        if (!event) {
          throw new Error("AI 串流格式不正確，請重試。");
        }

        if (event.type === "error") {
          throw new Error(
            typeof event.error === "string"
              ? event.error
              : "AI 回答中斷，請重試。"
          );
        }

        if (finalReply !== null) {
          throw new Error("AI 串流順序不正確，請重試。");
        }

        if (event.type === "delta") {
          if (typeof event.text !== "string") {
            throw new Error("AI 串流文字格式不正確。");
          }

          accumulated += event.text;
          return;
        }

        if (event.type === "done") {
          if (
            typeof event.reply !== "string" ||
            !event.reply.trim()
          ) {
            throw new Error("AI 沒有回傳有效回答，請重試。");
          }

          finalReply = event.reply.trim();
          accumulated = finalReply;
          return;
        }

        throw new Error("收到未知的 AI 串流事件。");
      }

      try {
        while (true) {
          const { value, done } = await reader.read();
          checkCurrent(current);

          buffer += done
            ? decoder.decode()
            : decoder.decode(value, { stream: true });

          let newline = buffer.indexOf("\n");

          while (newline !== -1) {
            consumeLine(buffer.slice(0, newline));
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf("\n");
          }

          if (done && buffer.trim()) {
            consumeLine(buffer);
            buffer = "";
          }

          if (accumulated !== lastDisplayed) {
            lastDisplayed = accumulated;
            onText(accumulated);
          }

          if (finalReply !== null) {
            return finalReply;
          }

          if (done) {
            throw new Error(
              "AI 連線中斷，回答尚未完成，請重試。"
            );
          }
        }
      } finally {
        // 清理連線失敗，不應把已完成的回答變成失敗。
        try {
          await reader.cancel();
        } catch {
          // 連線可能已經關閉。
        }

        reader.releaseLock();
      }
    } catch (cause) {
      if (current !== generation.current) {
        throw new Error("登入狀態已變更。");
      }

      if (timedOut) {
        throw new Error("AI 回覆逾時，請稍後再試。");
      }

      throw cause;
    } finally {
      window.clearTimeout(timer);
      requests.current.delete(controller);
      controller.abort();
    }
  }

  async function createConversation(title = "新問題") {
    if (
      !userId ||
      !ready ||
      creating.current ||
      folderBusy.current ||
      retrying.current
    ) {
      return null;
    }

    const ownerId = userId;
    const current = generation.current;
    creating.current = true;

    try {
      await ensureSession(ownerId, current);

      const conversation = await repository.create(
        ownerId,
        title.trim() || "新問題"
      );

      checkCurrent(current);

      updateConversations((items) => [
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

    const ownerId = userId;
    const current = generation.current;
    folderBusy.current = true;

    try {
      await ensureSession(ownerId, current);

      const folder = await repository.createFolder(
        ownerId,
        trimmedName
      );

      checkCurrent(current);
      updateFolders((items) => [folder, ...items]);

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

    const folder = folderItems.current.find(
      (item) => item.id === folderId
    );

    const conversationExists = conversationItems.current.some(
      (item) => item.id === conversationId
    );

    if (!folder || !conversationExists) {
      return false;
    }

    if (folder.conversationIds.includes(conversationId)) {
      return true;
    }

    const ownerId = userId;
    const current = generation.current;
    folderBusy.current = true;

    try {
      await ensureSession(ownerId, current);

      await repository.addConversationToFolder(
        ownerId,
        folderId,
        conversationId
      );

      checkCurrent(current);

      updateFolders((items) =>
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

    const folder = folderItems.current.find(
      (item) => item.id === folderId
    );

    if (!folder) {
      return false;
    }

    if (!folder.conversationIds.includes(conversationId)) {
      return true;
    }

    const ownerId = userId;
    const current = generation.current;
    folderBusy.current = true;

    try {
      await ensureSession(ownerId, current);

      await repository.removeConversationFromFolder(
        ownerId,
        folderId,
        conversationId
      );

      checkCurrent(current);

      updateFolders((items) =>
        items.map((item) =>
          item.id !== folderId
            ? item
            : {
                ...item,
                conversationIds: item.conversationIds.filter(
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
      retrying.current ||
      folderBusy.current ||
      updatingTitles.current.size > 0
    ) {
      return false;
    }

    if (
      !conversationItems.current.some(
        (item) => item.id === conversationId
      )
    ) {
      return false;
    }

    const ownerId = userId;
    const current = generation.current;
    folderBusy.current = true;

    try {
      await ensureSession(ownerId, current);

      await repository.deleteConversation(
        ownerId,
        conversationId
      );

      checkCurrent(current);

      updateConversations((items) =>
        items.filter((item) => item.id !== conversationId)
      );

      updateFolders((items) =>
        items.map((folder) => ({
          ...folder,
          conversationIds: folder.conversationIds.filter(
            (id) => id !== conversationId
          ),
        }))
      );

      const nextId = conversationItems.current[0]?.id ?? null;

      setActiveConversationId((activeId) =>
        activeId === conversationId ? nextId : activeId
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

  async function saveConversationTitle(
    ownerId: string,
    conversationId: string,
    question: string,
    current: number
  ) {
    if (
      current !== generation.current ||
      updatingTitles.current.has(conversationId)
    ) {
      return;
    }

    const title = fallbackTitle(question);
    updatingTitles.current.add(conversationId);

    try {
      await ensureSession(ownerId, current);

      await repository.title(
        ownerId,
        conversationId,
        title
      );

      checkCurrent(current);

      updateConversations((items) =>
        items.map((item) =>
          item.id === conversationId
            ? { ...item, title }
            : item
        )
      );
    } catch {
      // 標題是輔助功能；失敗時保留原標題，
      // 不覆蓋聊天或儲存失敗的提示。
    } finally {
      if (current === generation.current) {
        updatingTitles.current.delete(conversationId);
      }
    }
  }

  async function sendMessage(
    question: string
  ): Promise<boolean> {
    question = question.trim();

    if (!question) {
      return false;
    }

    if (!userId) {
      setError("請先登入再送出問題。");
      return false;
    }

    if (!ready) {
      setError(
        loading
          ? "對話資料仍在載入，請稍後再試。"
          : "對話資料未載入成功，請重新載入對話。"
      );

      return false;
    }

    if (question.length > MAX_MESSAGE_LENGTH) {
      setError("每則問題最多 8,000 字元，請縮短後再送出。");
      return false;
    }

    if (failedWrites.current.size > 0) {
      setError(
        "有尚未儲存的回答，請先按「重試儲存」。"
      );

      return false;
    }

    if (
      busy.current.size > 0 ||
      creating.current ||
      retrying.current ||
      folderBusy.current
    ) {
      setError("目前的操作尚未完成，請稍後再送出。");
      return false;
    }

    const ownerId = userId;
    const current = generation.current;

    let id = activeConversationId;
    let questionSaved = false;

    const lockId = id ?? "draft";

    busy.current.add(lockId);
    setBusyIds([...busy.current]);
    setError("");

    try {
      await ensureSession(ownerId, current);

      const existing = conversationItems.current.find(
        (item) => item.id === id
      );

      if (id && !existing) {
        throw new Error("找不到目前的對話，請重新選擇對話。");
      }

      const shouldUpdateTitle = Boolean(
        existing &&
          existing.title === "新問題" &&
          existing.messages.length === 0
      );

      if (!id) {
        const created = await createConversation(
          fallbackTitle(question)
        );

        if (!created) {
          return false;
        }

        checkCurrent(current);

        id = created.id;
        busy.current.add(id);
        setBusyIds([...busy.current]);
      }

      const conversationId = id;

      const userMessage: StoredMessage = {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        user_id: ownerId,
        role: "user",
        content: question,
        created_at: new Date().toISOString(),
      };

      await repository.saveMessage(userMessage);
      questionSaved = true;

      if (current !== generation.current) {
        return true;
      }

      const replyId = crypto.randomUUID();

      updateConversations((items) =>
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

      if (shouldUpdateTitle) {
        void saveConversationTitle(
          ownerId,
          conversationId,
          question,
          current
        );
      }

      let reply: string;

      try {
        reply = await callChatApi(
          ownerId,
          question,
          current,
          (text) => {
            if (current !== generation.current) {
              return;
            }

            updateConversations((items) =>
              items.map((item) =>
                item.id !== conversationId
                  ? item
                  : {
                      ...item,
                      messages: item.messages.map((message) =>
                        message.id !== replyId
                          ? message
                          : {
                              ...message,
                              content: text,
                              pending: false,
                            }
                      ),
                    }
              )
            );
          }
        );
      } catch (cause) {
        if (current !== generation.current) {
          return true;
        }

        // 不把中斷的部分回答當成完整回答保存。
        updateConversations((items) =>
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
          "問題已存入雲端，但 AI 回答未完成：" +
            getErrorMessage(cause)
        );

        return true;
      }

      if (current !== generation.current) {
        return true;
      }

      const assistantMessage: StoredMessage = {
        id: replyId,
        conversation_id: conversationId,
        user_id: ownerId,
        role: "assistant",
        content: reply,
        created_at: new Date().toISOString(),
      };

      updateConversations((items) =>
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
                        pending: false,
                      }
                ),
              }
        )
      );

      // 先暫存完整回答，再嘗試寫入雲端。
      failedWrites.current.set(replyId, assistantMessage);
      const locallyCached = persistDrafts(ownerId);
      setUnsavedCount(failedWrites.current.size);

      try {
        await ensureSession(ownerId, current);
        await repository.saveMessage(assistantMessage);

        if (current !== generation.current) {
          return true;
        }

        failedWrites.current.delete(replyId);
        persistDrafts(ownerId);
        setUnsavedCount(failedWrites.current.size);
      } catch (cause) {
        if (current !== generation.current) {
          return true;
        }

        setError(
          "AI 回覆尚未存入雲端，請按「重試儲存」。" +
            (locallyCached
              ? ""
              : "瀏覽器暫存也無法使用，請先不要重新整理或關閉分頁。") +
            `原因：${getErrorMessage(cause)}`
        );
      }

      return true;
    } catch (cause) {
      if (current === generation.current) {
        setError(
          (questionSaved
            ? "問題已存入雲端，但後續操作失敗："
            : "問題未存成功，尚未送給 AI：") +
            getErrorMessage(cause)
        );
      }

      return questionSaved;
    } finally {
      if (current === generation.current) {
        busy.current.delete(lockId);

        if (id) {
          busy.current.delete(id);
        }

        setBusyIds([...busy.current]);
      }
    }
  }

  async function retrySaving() {
    if (
      !userId ||
      !ready ||
      retrying.current ||
      busy.current.size > 0 ||
      creating.current ||
      folderBusy.current
    ) {
      return;
    }

    if (failedWrites.current.size === 0) {
      return;
    }

    const ownerId = userId;
    const current = generation.current;
    retrying.current = true;

    try {
      await ensureSession(ownerId, current);

      const rows = Array.from(failedWrites.current.entries());

      for (const [id, row] of rows) {
        checkCurrent(current);

        const conversationExists = conversationItems.current.some(
          (item) => item.id === row.conversation_id
        );

        if (!conversationExists) {
          throw new Error(
            "未儲存回答所屬的對話已不存在，無法寫回原對話。"
          );
        }

        await repository.saveMessage(row);
        checkCurrent(current);

        failedWrites.current.delete(id);
        persistDrafts(ownerId);
        setUnsavedCount(failedWrites.current.size);
      }

      setError("");
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
      folderBusy.current ||
      updatingTitles.current.size > 0
    ) {
      setError(
        failedWrites.current.size > 0
          ? "請先完成「重試儲存」，再重新載入對話。"
          : "目前的操作尚未完成，請稍後再重新載入。"
      );

      return;
    }

    setReloadVersion((value) => value + 1);
  }

  return {
    conversations: ready ? conversations : [],
    folders: ready ? folders : [],
    activeConversationId: ready ? activeConversationId : null,

    setActiveConversationId,

    loading,
    ready,
    error,

    busy: busyIds.length > 0,
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