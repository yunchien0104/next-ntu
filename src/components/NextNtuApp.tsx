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
import { useCloudTasks } from "@/lib/tasks/useCloudTasks";
import { supabase } from "@/lib/supabase";

import type {
  ProductPage,
  Theme,
} from "@/lib/types";

// Google 授權返回網站時，開啟日曆分頁。
// 網址中的結果由 CalendarPage 顯示並清除。
function getEntryPage(): ProductPage {
  if (typeof window === "undefined") {
    return "coach";
  }

  const url = new URL(window.location.href);
  const result = url.searchParams.get("googleCalendar");

  if (
    result === "connected" ||
    result === "cancelled" ||
    result === "error"
  ) {
    return "calendar";
  }

  return "coach";
}

export function NextNtuApp() {
  const [mounted, setMounted] = useState(false);

  const [userId, setUserId] =
    useState<string | null>(null);

  const [activePage, setActivePage] =
    useState<ProductPage>("coach");

  const [profileOpen, setProfileOpen] =
    useState(false);

  const [settingsOpen, setSettingsOpen] =
    useState(false);

  const [theme, setTheme] =
    useState<Theme>("dark");

  const [toast, setToast] = useState("");

  const [calendarDraft, setCalendarDraft] =
    useState("");

  // 共用資料放在主程式，切換頁面時繼續保留。
  const chat = useCloudConversations(userId);
  const taskStore = useCloudTasks(userId);

  const notify = useCallback((message: string) => {
    setToast(message);

    window.setTimeout(() => {
      setToast((current) =>
        current === message ? "" : current
      );
    }, 2200);
  }, []);

  const handleDraftConsumed = useCallback(() => {
    setCalendarDraft("");
  }, []);

  useEffect(() => {
    let alive = true;
    let authRevision = 0;

    // 在顯示登入後的畫面前，決定進入哪個分頁。
    setActivePage(getEntryPage());

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!alive) return;

        authRevision++;

        setUserId(session?.user.id ?? null);
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

    try {
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
    } catch {
      // 瀏覽器無法讀取本機設定時，使用預設主題。
    }

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  function handleLoginSuccess() {
    // 若 Google 授權返回後需要重新登入，
    // 登入成功仍會進入日曆分頁。
    setActivePage(getEntryPage());
    setProfileOpen(false);
    setSettingsOpen(false);
  }

  async function handleLogout() {
    if (chat.busyAny) {
      notify("對話仍在處理中，請完成後再登出");
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

    if (taskStore.busy) {
      notify("任務正在儲存，請完成後再登出");
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
      setCalendarDraft("");
      setActivePage("coach");

      // 清除尚未顯示的 Google 回呼提示。
      const url = new URL(window.location.href);

      url.searchParams.delete("googleCalendar");
      url.searchParams.delete(
        "googleCalendarMessage"
      );

      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`
      );
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

    try {
      window.localStorage.setItem(
        "next-ntu-theme",
        next
      );
    } catch {
      notify("主題已切換，但無法保存本機設定");
    }
  }

  function changePage(page: ProductPage) {
    setActivePage(page);
    setProfileOpen(false);
  }

  function coffee(name: string) {
    setCalendarDraft(
      `Coffee chat with ${name}`
    );

    changePage("calendar");
  }

  // 每次只回傳一個頁面，避免分頁累積。
  function renderActivePage() {
    switch (activePage) {
      case "coach":
        return (
          <CoachWorkspace
            taskStore={taskStore}
            notify={notify}
            onProfile={() =>
              setProfileOpen(true)
            }
            chat={chat}
          />
        );

      case "calendar":
        return (
          <CalendarPage
            taskStore={taskStore}
            notify={notify}
            draftTitle={calendarDraft}
            onDraftConsumed={handleDraftConsumed}
          />
        );

      case "columns":
        return (
          <ColumnsPage notify={notify} />
        );

      case "talent":
        return (
          <TalentPage
            notify={notify}
            onCoffee={coffee}
          />
        );

      case "resume":
        return (
          <ResumeStudio notify={notify} />
        );
    }
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]" />
    );
  }

  if (!userId) {
    return (
      <>
        <LoginScreen
          onLoginSuccess={handleLoginSuccess}
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

      <div
        key={`page-${userId}-${activePage}`}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {renderActivePage()}
      </div>

      <ProfileDrawer
        key={`profile-${userId}`}
        open={profileOpen}
        userId={userId}
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