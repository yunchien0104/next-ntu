"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type ParseStatus =
  | "pending"
  | "processing"
  | "ready"
  | "failed";

type UploadedFile = {
  id: string;
  original_name: string;
  storage_path: string;
  size_bytes: number;
  created_at: string;
  parse_status: ParseStatus;
  parse_error: string | null;
  parse_started_at: string | null;
};

type Props = {
  userId: string;
};

const BUCKET = "application-files";
const TABLE = "application_files";
const MAX_SIZE = 5 * 1024 * 1024;
const PROCESSING_TIMEOUT = 5 * 60 * 1000;

const FILE_COLUMNS =
  "id, original_name, storage_path, size_bytes, created_at, parse_status, parse_error, parse_started_at" as const;

const MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

const STATUS_LABELS: Record<ParseStatus, string> = {
  pending: "待解析",
  processing: "解析中…",
  ready: "已解析",
  failed: "解析失敗",
};

function errorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error
  ) {
    return String(error.message);
  }

  return "操作失敗，請稍後再試";
}

function processingIsRecent(file: UploadedFile) {
  if (
    file.parse_status !== "processing" ||
    !file.parse_started_at
  ) {
    return false;
  }

  return (
    Date.now() - Date.parse(file.parse_started_at) <
    PROCESSING_TIMEOUT
  );
}

export function ApplicationFiles({ userId }: Props) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const actionRef = useRef(false);
  const generationRef = useRef(0);

  // 帳號切換或元件關閉時，忽略舊請求的畫面更新。
  useEffect(() => {
    const generation = ++generationRef.current;
    let cancelled = false;

    setFiles([]);
    setLoading(true);
    setMessage("");

    async function loadFiles() {
      try {
        const { data, error } = await supabase
          .from(TABLE)
          .select(FILE_COLUMNS)
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (error) throw error;

        if (
          cancelled ||
          generation !== generationRef.current
        ) {
          return;
        }

        setFiles((data ?? []) as UploadedFile[]);
      } catch (error) {
        if (
          !cancelled &&
          generation === generationRef.current
        ) {
          setMessage(errorMessage(error));
        }
      } finally {
        if (
          !cancelled &&
          generation === generationRef.current
        ) {
          setLoading(false);
        }
      }
    }

    void loadFiles();

    return () => {
      cancelled = true;
      generationRef.current++;
    };
  }, [userId]);

  const hasProcessingFiles = files.some(
    (file) => file.parse_status === "processing"
  );

  // 解析仍在後端執行時，每四秒更新狀態。
  useEffect(() => {
    if (!hasProcessingFiles) return;

    const generation = generationRef.current;
    let cancelled = false;
    let checking = false;

    const timer = window.setInterval(async () => {
      if (checking) return;
      checking = true;

      try {
        const { data, error } = await supabase
          .from(TABLE)
          .select(FILE_COLUMNS)
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (
          cancelled ||
          generation !== generationRef.current
        ) {
          return;
        }

        if (!error) {
          setFiles((data ?? []) as UploadedFile[]);
        }
      } finally {
        checking = false;
      }
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [hasProcessingFiles, userId]);

  async function verifyUser() {
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    if (!data.user || data.user.id !== userId) {
      throw new Error("登入狀態已變更，請重新登入");
    }
  }

  async function getAccessToken() {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) throw error;

    if (!session || session.user.id !== userId) {
      throw new Error("登入已失效，請重新登入");
    }

    return session.access_token;
  }

  async function runAction(
    action: (generation: number) => Promise<void>
  ) {
    if (actionRef.current) return;

    const generation = generationRef.current;

    actionRef.current = true;
    setBusy(true);
    setMessage("");

    try {
      await verifyUser();

      if (generation !== generationRef.current) return;

      await action(generation);
    } catch (error) {
      if (generation === generationRef.current) {
        setMessage(errorMessage(error));
      }
    } finally {
      actionRef.current = false;

      if (generation === generationRef.current) {
        setBusy(false);
      }
    }
  }

  async function refreshFile(
    fileId: string,
    generation: number
  ) {
    const { data, error } = await supabase
      .from(TABLE)
      .select(FILE_COLUMNS)
      .eq("id", fileId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    if (generation !== generationRef.current) return;

    setFiles((current) => {
      if (!data) {
        return current.filter((file) => file.id !== fileId);
      }

      return current.map((file) =>
        file.id === fileId
          ? (data as UploadedFile)
          : file
      );
    });
  }

  async function requestParsing(
    fileId: string,
    generation: number
  ): Promise<"ready" | "processing"> {
    const accessToken = await getAccessToken();

    if (generation !== generationRef.current) {
      throw new Error("登入狀態已變更");
    }

    setMessage("檔案已保存，正在解析內容…");

    // 先顯示解析中，真正狀態稍後從資料庫讀回。
    setFiles((current) =>
      current.map((file) =>
        file.id === fileId
          ? {
              ...file,
              parse_status: "processing",
              parse_error: null,
              parse_started_at: new Date().toISOString(),
            }
          : file
      )
    );

    const controller = new AbortController();
    const timer = window.setTimeout(
      () => controller.abort(),
      55_000
    );

    try {
      const response = await fetch("/api/files/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ fileId }),
        signal: controller.signal,
      });

      const result: unknown = await response
        .json()
        .catch(() => null);

      const status =
        result &&
        typeof result === "object" &&
        "status" in result
          ? result.status
          : undefined;

      const serverError =
        result &&
        typeof result === "object" &&
        "error" in result &&
        typeof result.error === "string"
          ? result.error
          : undefined;

      // 另一個請求已開始解析時，等待它完成。
      if (
        response.status === 409 &&
        status === "processing"
      ) {
        return "processing";
      }

      if (!response.ok) {
        throw new Error(
          serverError ?? "解析失敗，請稍後重試"
        );
      }

      if (status !== "ready") {
        throw new Error("解析結果不完整，請重試");
      }

      return "ready";
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          "等待解析逾時，檔案仍已保存。" +
            "請稍後查看狀態；若解析中超過五分鐘，可重新解析。"
        );
      }

      throw error;
    } finally {
      window.clearTimeout(timer);

      try {
        await refreshFile(fileId, generation);
      } catch {
        if (generation === generationRef.current) {
          setMessage(
            "無法更新檔案狀態，請關閉側欄後重新開啟。"
          );
        }
      }
    }
  }

  async function uploadFile(file: File) {
    await runAction(async (generation) => {
      const extension =
        file.name.split(".").pop()?.toLowerCase() ?? "";

      const mimeType = MIME_TYPES[extension];

      if (!mimeType) {
        throw new Error("請上傳 PDF、Word、TXT、JPG 或 PNG");
      }

      if (file.size === 0 || file.size > MAX_SIZE) {
        throw new Error(
          "檔案不可為空，且必須小於或等於 5 MB"
        );
      }

      const id = crypto.randomUUID();
      const storagePath = `${userId}/${id}.${extension}`;

      setMessage("正在上傳檔案…");

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data, error: recordError } = await supabase
        .from(TABLE)
        .insert({
          id,
          user_id: userId,
          original_name: file.name,
          storage_path: storagePath,
          size_bytes: file.size,
          mime_type: mimeType,
        })
        .select(FILE_COLUMNS)
        .single();

      if (recordError) {
        const { error: cleanupError } =
          await supabase.storage
            .from(BUCKET)
            .remove([storagePath]);

        if (cleanupError) {
          throw new Error(
            `檔案紀錄保存失敗：${recordError.message}；` +
              "雲端檔案清理也失敗，需管理者檢查 Storage。"
          );
        }

        throw recordError;
      }

      if (generation !== generationRef.current) return;

      setFiles((current) => [
        data as UploadedFile,
        ...current.filter((item) => item.id !== id),
      ]);

      try {
        const status = await requestParsing(id, generation);

        if (generation !== generationRef.current) return;

        setMessage(
          status === "ready"
            ? "上傳成功，檔案內容已解析"
            : "檔案已保存，正在解析中…"
        );
      } catch (error) {
        if (generation === generationRef.current) {
          setMessage(
            "檔案已上傳並保存。" + errorMessage(error)
          );
        }
      }
    });
  }

  async function retryParsing(file: UploadedFile) {
    await runAction(async (generation) => {
      const status = await requestParsing(
        file.id,
        generation
      );

      if (generation !== generationRef.current) return;

      setMessage(
        status === "ready"
          ? "檔案內容已解析"
          : "檔案正在解析中…"
      );
    });
  }

  async function downloadFile(file: UploadedFile) {
    await runAction(async (generation) => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .download(file.storage_path);

      if (error) throw error;

      if (generation !== generationRef.current) return;

      const url = URL.createObjectURL(data);
      const link = document.createElement("a");

      link.href = url;
      link.download = file.original_name;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(
        () => URL.revokeObjectURL(url),
        1000
      );
    });
  }

  async function deleteFile(file: UploadedFile) {
    if (actionRef.current) return;

    if (
      !window.confirm(
        `確定刪除「${file.original_name}」？`
      )
    ) {
      return;
    }

    await runAction(async (generation) => {
      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .remove([file.storage_path]);

      if (storageError) throw storageError;

      // extracted_text 在同一筆紀錄內，會一起刪除。
      const { error: recordError } = await supabase
        .from(TABLE)
        .delete()
        .eq("id", file.id)
        .eq("user_id", userId);

      if (recordError) {
        throw new Error(
          "實際檔案已刪除，但清單更新失敗。" +
            "請再按一次 × 重試：" +
            recordError.message
        );
      }

      if (generation !== generationRef.current) return;

      setFiles((current) =>
        current.filter((item) => item.id !== file.id)
      );

      setMessage("已刪除檔案與解析內容");
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">申請素材</h3>

        <span className="text-sm opacity-60">
          {files.length} 份
        </span>
      </div>

      {loading && (
        <p className="text-sm opacity-60">載入中…</p>
      )}

      {!loading && files.length === 0 && (
        <p className="text-sm opacity-60">
          尚未上傳檔案
        </p>
      )}

      <div className="space-y-2">
        {files.map((file) => {
          const recentProcessing =
            processingIsRecent(file);

          return (
            <div
              key={file.id}
              className="rounded border border-current/20 p-3"
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void downloadFile(file)}
                  disabled={busy}
                  title={`下載 ${file.original_name}`}
                  className="min-w-0 flex-1 text-left disabled:opacity-50"
                >
                  <span className="block truncate text-sm">
                    {file.original_name}
                  </span>

                  <span className="block text-xs opacity-60">
                    {(file.size_bytes / 1024).toFixed(0)} KB
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void deleteFile(file)}
                  disabled={busy}
                  aria-label={`刪除 ${file.original_name}`}
                  title="刪除檔案"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-xl hover:bg-red-500/15 hover:text-red-500 disabled:opacity-40"
                >
                  ×
                </button>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <span
                  className={
                    file.parse_status === "failed"
                      ? "text-xs text-red-500"
                      : file.parse_status === "ready"
                        ? "text-xs text-green-600"
                        : "text-xs opacity-60"
                  }
                >
                  {STATUS_LABELS[file.parse_status] ??
                    "待解析"}
                </span>

                {file.parse_status !== "ready" && (
                  <button
                    type="button"
                    onClick={() => void retryParsing(file)}
                    disabled={busy || recentProcessing}
                    className="rounded border border-current/20 px-2 py-1 text-xs disabled:opacity-40"
                  >
                    {recentProcessing
                      ? "請稍候"
                      : file.parse_status === "pending"
                        ? "解析檔案"
                        : "重新解析"}
                  </button>
                )}
              </div>

              {file.parse_status === "failed" &&
                file.parse_error && (
                  <p className="mt-2 break-words text-xs text-red-500">
                    {file.parse_error}
                  </p>
                )}

              {file.parse_status === "processing" &&
                !recentProcessing && (
                  <p className="mt-2 text-xs opacity-60">
                    解析等待較久，可以按「重新解析」重試。
                  </p>
                )}
            </div>
          );
        })}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
        disabled={busy || loading}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];

          event.target.value = "";

          if (file) void uploadFile(file);
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy || loading}
        className="w-full rounded border border-current/30 px-3 py-2 text-sm disabled:opacity-50"
      >
        {busy ? "處理中…" : "＋ 加入申請素材"}
      </button>

      <p className="text-xs opacity-60">
        PDF、Word、TXT、JPG、PNG；每份最多 5 MB
      </p>

      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}