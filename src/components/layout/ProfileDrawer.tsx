"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { Button } from "@/components/ui/Button";
import { ApplicationFiles } from "@/components/profile/ApplicationFiles";
import { supabase } from "@/lib/supabase";

interface Profile {
  id: string;
  name: string | null;
  major: string | null;
  year: number | null;
  program: string | null;
  avatar_path: string | null;
}

interface ProfileForm {
  name: string;
  major: string;
  year: string;
  program: string;
}

interface ProfileDrawerProps {
  open: boolean;
  userId: string | null;
  onClose: () => void;
  notify: (message: string) => void;
  onLogout: () => void;
}

const PROFILE_COLUMNS =
  "id,name,major,year,program,avatar_path";

const AVATAR_BUCKET = "profile-avatars";

const emptyForm: ProfileForm = {
  name: "",
  major: "",
  year: "",
  program: "",
};

// 切換帳號時重新建立畫面。
export function ProfileDrawer(props: ProfileDrawerProps) {
  if (!props.userId) return null;

  return (
    <ProfileDrawerContent
      key={props.userId}
      {...props}
      userId={props.userId}
    />
  );
}

function ProfileDrawerContent({
  open,
  userId,
  onClose,
  notify,
  onLogout,
}: Omit<ProfileDrawerProps, "userId"> & {
  userId: string;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState("");

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mountedRef = useRef(false);
  const savingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 讀取目前帳號的基本資料與照片。
  useEffect(() => {
    let alive = true;

    async function loadProfile() {
      setLoading(true);
      setLoadError("");

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select(PROFILE_COLUMNS)
          .eq("id", userId)
          .maybeSingle();

        if (error) throw error;
        if (!alive) return;

        const nextProfile = data as Profile | null;

        setProfile(nextProfile);
        setAvatarBlob(null);

        if (nextProfile?.avatar_path) {
          const result = await supabase.storage
            .from(AVATAR_BUCKET)
            .download(nextProfile.avatar_path);

          if (!alive) return;

          if (result.error) {
            console.error("Load avatar failed:", result.error);
            notify("基本資料已載入，但照片讀取失敗");
          } else {
            setAvatarBlob(result.data);
          }
        }
      } catch (error) {
        if (!alive) return;

        console.error("Load profile failed:", error);
        setLoadError("無法讀取個人資料，請重新載入。");
      } finally {
        if (alive) setLoading(false);
      }
    }

    void loadProfile();

    return () => {
      alive = false;
    };
  }, [userId, reloadVersion, notify]);

  // 建立照片預覽網址，使用完後釋放。
  useEffect(() => {
    const source = avatarFile ?? avatarBlob;

    if (!source) {
      setAvatarUrl("");
      return;
    }

    const url = URL.createObjectURL(source);
    setAvatarUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [avatarFile, avatarBlob]);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) return;

    if (editing && !dialog.open) {
      dialog.showModal();
    } else if (!editing && dialog.open) {
      dialog.close();
    }
  }, [editing]);

  function openEditor() {
    if (loading || loadError || savingRef.current) return;

    setForm({
      name: profile?.name ?? "",
      major: profile?.major ?? "",
      year: profile?.year != null ? String(profile.year) : "",
      program: profile?.program ?? "",
    });

    setAvatarFile(null);
    setFormError("");
    setEditing(true);
  }

  function closeEditor() {
    if (savingRef.current) return;

    setEditing(false);
    setAvatarFile(null);
    setFormError("");
  }

  function updateForm(field: keyof ProfileForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function selectAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const supportedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!supportedTypes.includes(file.type)) {
      setFormError("照片請使用 JPG、PNG 或 WebP");
      return;
    }

    if (file.size === 0 || file.size > 2 * 1024 * 1024) {
      setFormError("照片不可為空，且最大為 2 MB");
      return;
    }

    setFormError("");
    setAvatarFile(file);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (savingRef.current || loading || loadError) return;

    const name = form.name.trim();
    const major = form.major.trim();
    const program = form.program.trim();
    const year = Number(form.year);

    if (!name || !major || !form.year) {
      setFormError("請填寫姓名、系所與年級");
      return;
    }

    if (!Number.isInteger(year) || year < 1 || year > 10) {
      setFormError("年級請填寫 1 到 10 的整數");
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setFormError("");

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getSession();

      if (authError) throw authError;

      if (authData.session?.user.id !== userId) {
        throw new Error("登入狀態已變更，請重新登入");
      }

      if (!mountedRef.current) return;

      let avatarPath = profile?.avatar_path ?? null;
      const selectedPhoto = avatarFile;

      if (selectedPhoto) {
        const extensions: Record<string, string> = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
        };

        const extension = extensions[selectedPhoto.type];

        avatarPath =
          `${userId}/${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from(AVATAR_BUCKET)
          .upload(avatarPath, selectedPhoto, {
            contentType: selectedPhoto.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;
        if (!mountedRef.current) return;
      }

      const values = {
        name,
        major,
        year,
        program: program || null,
        avatar_path: avatarPath,
        updated_at: new Date().toISOString(),
      };

      const updateResult = await supabase
        .from("profiles")
        .update(values)
        .eq("id", userId)
        .select(PROFILE_COLUMNS)
        .maybeSingle();

      if (updateResult.error) throw updateResult.error;
      if (!mountedRef.current) return;

      let savedProfile = updateResult.data as Profile | null;

      if (!savedProfile) {
        const insertResult = await supabase
          .from("profiles")
          .insert({
            id: userId,
            ...values,
          })
          .select(PROFILE_COLUMNS)
          .single();

        if (!mountedRef.current) return;

        if (insertResult.error?.code === "23505") {
          const retryResult = await supabase
            .from("profiles")
            .update(values)
            .eq("id", userId)
            .select(PROFILE_COLUMNS)
            .single();

          if (retryResult.error) throw retryResult.error;
          savedProfile = retryResult.data as Profile;
        } else {
          if (insertResult.error) throw insertResult.error;
          savedProfile = insertResult.data as Profile;
        }
      }

      if (!mountedRef.current) return;

      setProfile(savedProfile);

      if (selectedPhoto) {
        setAvatarBlob(selectedPhoto);
      }

      setAvatarFile(null);
      setEditing(false);
      notify("Profile 已儲存");
    } catch (error) {
      if (!mountedRef.current) return;

      console.error("Save profile failed:", error);
      setFormError(
        "儲存失敗，請確認網路與登入狀態後重試。"
      );
    } finally {
      if (mountedRef.current) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  }

  const inputClass =
    "mt-2 w-full border border-[var(--line-strong)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--paper)] disabled:opacity-50";

  const profileSummary = [
    profile?.major,
    profile?.year != null ? `${profile.year} 年級` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const avatarInitial =
    profile?.name?.trim().slice(0, 1) || "？";

  return (
    <>
      <button
        type="button"
        aria-label="關閉個人檔案"
        className={`fixed inset-0 top-14 z-40 bg-black/65 transition ${
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        tabIndex={open ? 0 : -1}
      />

      <aside
        className={`fixed right-0 top-14 bottom-0 z-50 w-[min(390px,94vw)] overflow-y-auto border-l border-[var(--line)] bg-[var(--panel)] shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-label="個人檔案側欄"
        aria-hidden={!open}
        inert={!open}
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

          <Button variant="quiet" onClick={onClose}>
            ✕
          </Button>
        </header>

        <div className="p-4">
          <section className="border border-[var(--line)] bg-[var(--bg)] p-4">
            {loading ? (
              <p className="py-4 text-sm text-[var(--muted)]">
                正在載入 Profile…
              </p>
            ) : loadError ? (
              <div>
                <p
                  role="alert"
                  className="text-xs text-[var(--soft)]"
                >
                  {loadError}
                </p>

                <Button
                  className="mt-3"
                  onClick={() =>
                    setReloadVersion((value) => value + 1)
                  }
                >
                  重新載入
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--paper)] text-lg font-bold text-[var(--paper-ink)]">
                    {avatarBlob && avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="個人大頭照"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      avatarInitial
                    )}
                  </div>

                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">
                      {profile?.name || "尚未填寫個人資料"}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {profileSummary || "新增你的基本資料"}
                    </p>
                  </div>
                </div>

                {profile?.program && (
                  <div className="mt-4">
                    <span className="border border-[var(--line)] px-2 py-1 text-[10px]">
                      {profile.program}
                    </span>
                  </div>
                )}

                <Button
                  full
                  className="mt-4"
                  onClick={openEditor}
                >
                  編輯 Profile
                </Button>
              </>
            )}
          </section>

          {/* 雲端申請素材：上傳、下載、× 刪除 */}
          <div className="mt-6">
            <ApplicationFiles
              key={userId}
              userId={userId}
            />
          </div>

          <p className="mt-6 border border-[var(--line)] bg-[var(--bg)] p-3 text-[10px] leading-5 text-[var(--muted)]">
            這是互動產品原型。正式版會在每則建議旁標示來源、
            資料時間與可信度；Facebook 與校內資料也需要依權限
            與平台規範串接。
          </p>

          <div className="mt-6 border-t border-[var(--line)] pt-4">
            <Button full variant="quiet" onClick={onLogout}>
              登出
            </Button>
          </div>
        </div>
      </aside>

      <dialog
        ref={dialogRef}
        aria-labelledby="profile-editor-title"
        className="fixed inset-0 m-auto max-h-[90dvh] w-[min(480px,92vw)] overflow-y-auto border border-[var(--line-strong)] bg-[var(--panel)] p-0 text-[var(--text)] shadow-2xl backdrop:bg-black/70"
        onCancel={(event) => {
          event.preventDefault();
          closeEditor();
        }}
      >
        <form onSubmit={saveProfile}>
          <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
            <h2
              id="profile-editor-title"
              className="text-base font-semibold"
            >
              編輯 Profile
            </h2>

            <button
              type="button"
              aria-label="關閉編輯視窗"
              className="h-8 w-8 disabled:opacity-40"
              onClick={closeEditor}
              disabled={saving}
            >
              ✕
            </button>
          </header>

          <fieldset
            disabled={saving}
            className="space-y-5 p-5"
          >
            <div className="flex items-center gap-4">
              <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--bg)] text-2xl text-[var(--muted)]">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="大頭照預覽"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  "＋"
                )}
              </div>

              <div>
                <button
                  type="button"
                  className="border border-[var(--line-strong)] px-3 py-2 text-xs disabled:opacity-40"
                  onClick={() =>
                    avatarInputRef.current?.click()
                  }
                >
                  上傳大頭照
                </button>

                <p className="mt-2 text-[10px] text-[var(--muted)]">
                  JPG、PNG、WebP，最大 2 MB
                </p>
              </div>

              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={selectAvatar}
              />
            </div>

            <label className="block text-xs">
              姓名
              <input
                className={inputClass}
                value={form.name}
                onChange={(event) =>
                  updateForm("name", event.target.value)
                }
                maxLength={80}
                autoComplete="name"
                placeholder="請輸入姓名"
                required
              />
            </label>

            <label className="block text-xs">
              系所
              <input
                className={inputClass}
                value={form.major}
                onChange={(event) =>
                  updateForm("major", event.target.value)
                }
                maxLength={120}
                placeholder="例如：財務金融學系"
                required
              />
            </label>

            <label className="block text-xs">
              年級
              <input
                type="number"
                className={inputClass}
                value={form.year}
                onChange={(event) =>
                  updateForm("year", event.target.value)
                }
                min={1}
                max={10}
                step={1}
                placeholder="例如：3"
                required
              />
            </label>

            <label className="block text-xs">
              學程（選填）
              <input
                className={inputClass}
                value={form.program}
                onChange={(event) =>
                  updateForm("program", event.target.value)
                }
                maxLength={160}
                placeholder="例如：資料科學學程"
              />
            </label>
          </fieldset>

          {formError && (
            <p
              role="alert"
              className="px-5 pb-4 text-xs text-red-400"
            >
              {formError}
            </p>
          )}

          <footer className="flex justify-end gap-3 border-t border-[var(--line)] px-5 py-4">
            <button
              type="button"
              className="border border-[var(--line)] px-4 py-2 text-xs disabled:opacity-40"
              onClick={closeEditor}
              disabled={saving}
            >
              取消
            </button>

            <button
              type="submit"
              className="bg-[var(--paper)] px-4 py-2 text-xs font-semibold text-[var(--paper-ink)] disabled:opacity-40"
              disabled={saving}
            >
              {saving ? "儲存中…" : "儲存"}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}