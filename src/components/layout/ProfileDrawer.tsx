"use client";

import { ChangeEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

interface FileRow {
  id: string;
  kind: string;
  name: string;
  meta: string;
  ready: boolean;
}

interface ProfileDrawerProps {
  open: boolean;
  onClose: () => void;
  notify: (message: string) => void;
  onLogout: () => void;
}

const initialFiles: FileRow[] = [
  {
    id: "resume",
    kind: "PDF",
    name: "履歷_v3.pdf",
    meta: "昨天更新 · 1.2 MB",
    ready: true,
  },
  {
    id: "transcript",
    kind: "PDF",
    name: "歷年成績單.pdf",
    meta: "官方版本 · 840 KB",
    ready: true,
  },
  {
    id: "plan",
    kind: "DOC",
    name: "讀書計畫_草稿",
    meta: "完整度 45%",
    ready: false,
  },
  {
    id: "github",
    kind: "URL",
    name: "GitHub Portfolio",
    meta: "3 個公開專案",
    ready: true,
  },
];

export function ProfileDrawer({
  open,
  onClose,
  notify,
  onLogout,
}: ProfileDrawerProps) {
  const [files, setFiles] = useState(initialFiles);
  const inputRef = useRef<HTMLInputElement>(null);

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    const kind = (file.name.split(".").pop() || "FILE")
      .toUpperCase()
      .slice(0, 3);

    setFiles((rows) => [
      {
        id: `${file.name}-${Date.now()}`,
        kind,
        name: file.name,
        meta: `剛剛加入 · ${(file.size / 1024 / 1024).toFixed(1)} MB`,
        ready: true,
      },
      ...rows,
    ]);

    notify("素材已加入檔案櫃");
    event.target.value = "";
  }

  function handleLogoutClick() {
    onLogout();
  }

  return (
    <>
      <button
        aria-label="關閉個人檔案"
        className={`fixed inset-0 top-14 z-40 bg-black/65 transition ${
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      <aside
        className={`fixed right-0 top-14 bottom-0 z-50 w-[min(390px,94vw)] overflow-y-auto border-l border-[var(--line)] bg-[var(--panel)] shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-label="個人檔案側欄"
      >
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-[var(--line)] bg-[var(--panel)]/95 px-4 backdrop-blur">
          <div>
            <div className="font-mono text-[9px] tracking-[.16em] text-[var(--muted)]">
              PERSONAL VAULT
            </div>

            <h2 className="text-sm font-semibold">
              個人檔案櫃
            </h2>
          </div>

          <Button
            variant="quiet"
            onClick={onClose}
          >
            ✕
          </Button>
        </header>

        <div className="p-4">
          <section className="border border-[var(--line)] bg-[var(--bg)] p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center bg-[var(--paper)] font-bold text-[var(--paper-ink)]">
                YC
              </div>

              <div>
                <h3 className="font-semibold">
                  游同學
                </h3>

                <p className="text-xs text-[var(--muted)]">
                  資管系 · 大三 · GPA 3.72
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              <span className="border border-[var(--line)] px-2 py-1 text-[10px]">
                資訊管理學系
              </span>

              <span className="border border-[var(--line)] px-2 py-1 text-[10px]">
                資料科學學程
              </span>
            </div>

            <div className="mt-5 border-t border-[var(--line)] pt-4">
              <div className="flex items-end justify-between">
                <div>
                  <b className="text-2xl">
                    92
                  </b>

                  <span className="text-xs text-[var(--muted)]">
                    {" "}
                    / 128 學分
                  </span>
                </div>

                <span className="text-xs text-[var(--muted)]">
                  畢業進度 72%
                </span>
              </div>

              <div className="mt-2 h-1 bg-[var(--line)]">
                <span className="block h-full w-[72%] bg-[var(--paper)]" />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  ["12", "必修待修"],
                  ["18", "選修待修"],
                  ["6", "通識待修"],
                ].map(([value, label]) => (
                  <div
                    key={label}
                    className="border border-[var(--line)] p-2"
                  >
                    <b className="block text-sm">
                      {value}
                    </b>

                    <span className="text-[9px] text-[var(--muted)]">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="mb-2 mt-6 flex justify-between text-xs">
            <strong>
              申請素材
            </strong>

            <span className="text-[var(--muted)]">
              {files.length} 份
            </span>
          </div>

          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.id}
                className="grid grid-cols-[38px_1fr_auto] items-center gap-3 border border-[var(--line)] bg-[var(--bg)] p-3"
              >
                <span className="grid h-9 place-items-center border border-[var(--line)] font-mono text-[9px]">
                  {file.kind}
                </span>

                <div className="min-w-0">
                  <b className="block truncate text-xs">
                    {file.name}
                  </b>

                  <span className="text-[10px] text-[var(--muted)]">
                    {file.meta}
                  </span>
                </div>

                <i
                  className={`h-2 w-2 rounded-full ${
                    file.ready
                      ? "bg-[#ddd]"
                      : "bg-[#555]"
                  }`}
                />
              </div>
            ))}
          </div>

          <input
            ref={inputRef}
            className="hidden"
            type="file"
            onChange={upload}
          />

          <Button
            full
            className="mt-3"
            onClick={() =>
              inputRef.current?.click()
            }
          >
            ＋ 加入申請素材
          </Button>

          <p className="mt-6 border border-[var(--line)] bg-[var(--bg)] p-3 text-[10px] leading-5 text-[var(--muted)]">
            這是互動產品原型。正式版會在每則建議旁標示來源、資料時間與可信度；Facebook
            與校內資料也需要依權限與平台規範串接。
          </p>

          <div className="mt-6 border-t border-[var(--line)] pt-4">
            <Button
              full
              variant="quiet"
              onClick={handleLogoutClick}
            >
              登出
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}