"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { LoginScreen } from "@/components/auth/LoginScreen";
import { CalendarPage } from "@/components/calendar/CalendarPage";
import { CoachWorkspace } from "@/components/coach/CoachWorkspace";
import { ColumnsPage } from "@/components/columns/ColumnsPage";
import { ProfileDrawer } from "@/components/layout/ProfileDrawer";
import { SettingsModal } from "@/components/layout/SettingsModal";
import { TopBar } from "@/components/layout/TopBar";
import { ResumeStudio } from "@/components/resume/ResumeStudio";
import { TalentPage } from "@/components/talent/TalentPage";
import { Toast } from "@/components/ui/Toast";

import { useCloudConversations } from "@/lib/chat/useCloudConversations";
import { initialTodos } from "@/lib/data";
import { usePersistentState } from "@/lib/storage";
import { supabase } from "@/lib/supabase";

import type {
  ProductPage,
  Theme,
} from "@/lib/types";

export function NextNtuApp() {
  const [mounted, setMounted] =
    useState(false);

  const [userId, setUserId] =
    useState<string | null>(null);

  const signedIn = Boolean(userId);

  const [activePage, setActivePage] =
    useState<ProductPage>("coach");

  const [profileOpen, setProfileOpen] =
    useState(false);

  const [settingsOpen, setSettingsOpen] =
    useState(false);

  const [theme, setTheme] =
    useState<Theme>("dark");

  const [toast, setToast] =
    useState("");

  const [calendarDraft, setCalendarDraft] =
    useState("");

  // Todo 目前繼續使用原本的本機儲存。
  const [todos, setTodos] =
    usePersistentState(
      "next-ntu-tasks",
      initialTodos
    );

  // 對話由 Supabase 儲存。
  // Hook 放在主程式，切換頁面時仍能繼續處理回答。
  const chat =
    useCloudConversations(userId);

  const notify = useCallback(
    (message: string) => {
      setToast(message);

      window.setTimeout(() => {
        setToast((current) =>
          current === message
            ? ""
            : current
        );
      }, 2200);
    },
    []
  );

  // 取得目前帳號，並監聽登入、登出與帳號切換。
  useEffect(() => {
    let alive = true;
    let authRevision = 0;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!alive) return;

        authRevision++;

        setUserId(
          session?.user.id ?? null
        );

        setMounted(true);
      }
    );

    async function checkSession() {
      const revision = authRevision;

      try {
        const { data, error } =
          await supabase.auth.getSession();

        if (
          !alive ||
          revision !== authRevision
        ) {
          return;
        }

        if (error) {
          console.error(
            "Read session failed:",
            error
          );

          setUserId(null);
          return;
        }

        setUserId(
          data.session?.user.id ?? null
        );
      } catch (error) {
        if (
          alive &&
          revision === authRevision
        ) {
          console.error(
            "Read session failed:",
            error
          );

          setUserId(null);
        }
      } finally {
        if (alive) {
          setMounted(true);
        }
      }
    }

    void checkSession();

    const savedTheme =
      window.localStorage.getItem(
        "next-ntu-theme"
      );

    if (
      savedTheme === "light" ||
      savedTheme === "dark"
    ) {
      setTheme(savedTheme);
    }

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  function handleLoginSuccess() {
    // 帳號 ID 由上面的登入狀態監聽器更新。
    setActivePage("coach");
    setProfileOpen(false);
  }

  async function handleLogout() {
    if (chat.busyAny) {
      notify(
        "對話仍在處理中，請完成後再登出"
      );
      return;
    }

    if (chat.unsavedCount > 0) {
      setActivePage("coach");
      setProfileOpen(false);

      notify(
        "還有訊息未存入雲端，請先按「重試儲存」"
      );
      return;
    }

    try {
      const { error } =
        await supabase.auth.signOut();

      if (error) {
        console.error(
          "Sign out failed:",
          error
        );

        notify("登出失敗");
        return;
      }

      setUserId(null);
      setProfileOpen(false);
      setSettingsOpen(false);
    } catch (error) {
      console.error(
        "Sign out failed:",
        error
      );

      notify("登出失敗");
    }
  }

  function changeTheme(next: Theme) {
    setTheme(next);

    window.localStorage.setItem(
      "next-ntu-theme",
      next
    );
  }

  function changePage(
    page: ProductPage
  ) {
    setActivePage(page);
    setProfileOpen(false);
  }

  function coffee(name: string) {
    setCalendarDraft(
      `Coffee chat with ${name}`
    );

    changePage("calendar");
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]" />
    );
  }

  if (!signedIn) {
    return (
      <>
        <LoginScreen
          onLoginSuccess={
            handleLoginSuccess
          }
        />

        <Toast message={toast} />
      </>
    );
  }

  return (
    <div
      data-theme={theme}
      className="flex h-screen min-h-[650px] flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)] transition-colors"
    >
      <TopBar
        activePage={activePage}
        onPageChange={changePage}
        onProfile={() =>
          setProfileOpen(true)
        }
        onSettings={() =>
          setSettingsOpen(true)
        }
      />

      {activePage === "coach" && (
        <CoachWorkspace
          todos={todos}
          setTodos={setTodos}
          notify={notify}
          onProfile={() =>
            setProfileOpen(true)
          }
          chat={chat}
        />
      )}

      {activePage === "calendar" && (
        <CalendarPage
          notify={notify}
          draftTitle={calendarDraft}
          onDraftConsumed={() =>
            setCalendarDraft("")
          }
        />
      )}

      {activePage === "columns" && (
        <ColumnsPage
          notify={notify}
        />
      )}

      {activePage === "talent" && (
        <TalentPage
          notify={notify}
          onCoffee={coffee}
        />
      )}

      {activePage === "resume" && (
        <ResumeStudio
          notify={notify}
        />
      )}

      <ProfileDrawer
        open={profileOpen}
        onClose={() =>
          setProfileOpen(false)
        }
        notify={notify}
        onLogout={handleLogout}
      />

      <SettingsModal
        open={settingsOpen}
        theme={theme}
        onThemeChange={changeTheme}
        onClose={() =>
          setSettingsOpen(false)
        }
        notify={notify}
      />

      <Toast message={toast} />
    </div>
  );
}