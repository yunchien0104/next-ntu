"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type UploadedFile = {
  id: string;
  original_name: string;
  storage_path: string;
  size_bytes: number;
  created_at: string;
};

type Props = {
  userId: string;
};

const BUCKET = "application-files";
const TABLE = "application_files";
const MAX_SIZE = 5 * 1024 * 1024;

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

export function ApplicationFiles({ userId }: Props) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const actionRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadFiles() {
      setLoading(true);
      setMessage("");

      const { data, error } = await supabase
        .from(TABLE)
        .select(
          "id, original_name, storage_path, size_bytes, created_at"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        setMessage(error.message);
      } else {
        setFiles((data ?? []) as UploadedFile[]);
      }

      setLoading(false);
    }

    void loadFiles();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // 確認目前登入帳號與此元件的帳號一致
  async function verifyUser() {
    const { data, error } = await supabase.auth.getUser();

    if (error) throw error;

    if (!data.user || data.user.id !== userId) {
      throw new Error("登入狀態已變更，請重新登入");
    }
  }

  async function runAction(action: () => Promise<void>) {
    if (actionRef.current) return;

    actionRef.current = true;
    setBusy(true);
    setMessage("");

    try {
      await verifyUser();
      await action();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      actionRef.current = false;
      setBusy(false);
    }
  }

  async function uploadFile(file: File) {
    await runAction(async () => {
      const extension =
        file.name.split(".").pop()?.toLowerCase() ?? "";

      const mimeType = MIME_TYPES[extension];

      if (!mimeType) {
        throw new Error("請上傳 PDF、Word、TXT、JPG 或 PNG");
      }

      if (file.size === 0 || file.size > MAX_SIZE) {
        throw new Error("檔案不可為空，且必須小於或等於 5 MB");
      }

      const id = crypto.randomUUID();
      const storagePath = `${userId}/${id}.${extension}`;

      // 第一步：上傳實際檔案
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // 第二步：保存檔案清單紀錄
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
        .select(
          "id, original_name, storage_path, size_bytes, created_at"
        )
        .single();

      if (recordError) {
        // 紀錄保存失敗時，清除剛上傳的檔案
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

      setFiles((current) => [
        data as UploadedFile,
        ...current,
      ]);

      setMessage("上傳成功");
    });
  }

  async function downloadFile(file: UploadedFile) {
    await runAction(async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .download(file.storage_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const link = document.createElement("a");

      link.href = url;
      link.download = file.original_name;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  async function deleteFile(file: UploadedFile) {
    if (actionRef.current) return;

    if (!window.confirm(`確定刪除「${file.original_name}」？`)) {
      return;
    }

    await runAction(async () => {
      // 先刪實際檔案，避免只刪清單卻留下檔案
      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .remove([file.storage_path]);

      if (storageError) throw storageError;

      const { data, error: recordError } = await supabase
        .from(TABLE)
        .delete()
        .eq("id", file.id)
        .eq("user_id", userId)
        .select("id");

      if (recordError) {
        throw new Error(
          "實際檔案已刪除，但清單更新失敗。" +
            "請再按一次 × 重試：" +
            recordError.message
        );
      }

      if (!data?.length) {
        throw new Error("未刪除任何紀錄，請重新整理確認");
      }

      setFiles((current) =>
        current.filter((item) => item.id !== file.id)
      );

      setMessage("已刪除檔案");
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
        {files.map((file) => (
          <div
            key={file.id}
            className="flex items-center gap-2 rounded border border-current/20 p-3"
          >
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
        ))}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];

          // 清空後，才能再次選擇同一份檔案
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
