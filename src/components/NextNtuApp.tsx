"use client";

import { useCallback, useEffect, useState } from "react";
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
import { initialTodos } from "@/lib/data";
import { usePersistentState } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import type { ProductPage, Theme } from "@/lib/types";

export function NextNtuApp() {
  const [mounted, setMounted] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

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

  const [todos, setTodos] =
    usePersistentState(
      "next-ntu-tasks",
      initialTodos
    );

  useEffect(() => {
    async function checkSession() {
      const { data } =
        await supabase.auth.getSession();

      setSignedIn(Boolean(data.session));
      setMounted(true);
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSignedIn(Boolean(session));
      }
    );

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
      subscription.unsubscribe();
    };
  }, []);

  const notify = useCallback(
    (message: string) => {
      setToast(message);

      window.setTimeout(() => {
        setToast((current) =>
          current === message ? "" : current
        );
      }, 2200);
    },
    []
  );

  function handleLoginSuccess() {
    setSignedIn(true);
  }

  async function handleLogout() {
    const { error } =
      await supabase.auth.signOut();

    if (error) {
      notify("登出失敗");
      return;
    }

    setSignedIn(false);
    setProfileOpen(false);
  }

  function changeTheme(next: Theme) {
    setTheme(next);

    window.localStorage.setItem(
      "next-ntu-theme",
      next
    );
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

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]" />
    );
  }

  if (!signedIn) {
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

      {activePage === "coach" && (
        <CoachWorkspace
          todos={todos}
          setTodos={setTodos}
          notify={notify}
          onProfile={() =>
            setProfileOpen(true)
          }
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
        <ColumnsPage notify={notify} />
      )}

      {activePage === "talent" && (
        <TalentPage
          notify={notify}
          onCoffee={coffee}
        />
      )}

      {activePage === "resume" && (
        <ResumeStudio notify={notify} />
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
