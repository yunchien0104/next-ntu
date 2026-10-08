"use client";

import {
  useRef,
  useState,
  type FormEvent,
} from "react";
import Image from "next/image";

import { supabase } from "@/lib/supabase";

type AuthMode = "login" | "signup" | "forgot";

type LoginScreenProps = {
  onLoginSuccess: () => void;
};

const SITE_URL = "https://next-ntu.vercel.app";

export function LoginScreen({
  onLoginSuccess,
}: LoginScreenProps) {
  const [mode, setMode] =
    useState<AuthMode>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const submittingRef = useRef(false);

  function switchMode(nextMode: AuthMode) {
    if (submittingRef.current) return;

    setMode(nextMode);
    setMessage("");
    setPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (submittingRef.current) return;

    setMessage("");

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setMessage("請輸入 Email");
      return;
    }

    if (mode !== "forgot" && !password) {
      setMessage("請輸入密碼");
      return;
    }

    if (mode === "signup") {
      if (password.length < 8) {
        setMessage("密碼至少需要 8 個字元");
        return;
      }

      if (password !== confirmPassword) {
        setMessage("兩次輸入的密碼不一致");
        return;
      }
    }

    submittingRef.current = true;
    setLoading(true);

    try {
      // 忘記密碼：返回正式網站的重設密碼頁。
      if (mode === "forgot") {
        const { error } =
          await supabase.auth.resetPasswordForEmail(
            normalizedEmail,
            {
              redirectTo:
                `${SITE_URL}/reset-password`,
            }
          );

        if (error) {
          setMessage(error.message);
          return;
        }

        setMessage(
          "重設密碼連結已寄出，請查看信箱。"
        );
        return;
      }

      // 註冊：驗證後返回正式網站的驗證完成頁。
      if (mode === "signup") {
        const { data, error } =
          await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
              emailRedirectTo:
                `${SITE_URL}/auth/verified`,
            },
          });

        if (error) {
          setMessage(error.message);
          return;
        }

        if (data.session) {
          onLoginSuccess();
          return;
        }

        setPassword("");
        setConfirmPassword("");
        setMode("login");

        setMessage(
          "註冊申請已送出，請至信箱查看驗證信。若已註冊，請直接登入。"
        );
        return;
      }

      // 登入。
      const { error } =
        await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

      if (error) {
        setMessage(error.message);
        return;
      }

      onLoginSuccess();
    } catch (error) {
      console.error("Auth request failed:", error);

      setMessage(
        "暫時無法連線，請確認網路後再試一次。"
      );
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <section className="login-screen">
      <form
        className="login-card"
        onSubmit={handleSubmit}
      >
        <div className="login-logo-wrap">
          <Image
            src="/next-at-ntu-logo.png"
            alt="Next@NTU logo"
            width={72}
            height={72}
            priority
          />

          <div className="login-brand-name">
            Next@NTU
          </div>
        </div>

        <div className="login-field">
          <label htmlFor="auth-email">
            Email
          </label>

          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            disabled={loading}
            required
          />
        </div>

        {mode !== "forgot" && (
          <div className="login-field">
            <label htmlFor="auth-password">
              密碼
            </label>

            <input
              id="auth-password"
              type="password"
              autoComplete={
                mode === "signup"
                  ? "new-password"
                  : "current-password"
              }
              placeholder="••••••••"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              disabled={loading}
              required
            />
          </div>
        )}

        {mode === "signup" && (
          <div className="login-field">
            <label htmlFor="confirm-password">
              確認密碼
            </label>

            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(
                  event.target.value
                )
              }
              disabled={loading}
              required
            />
          </div>
        )}

        <button
          className="login-submit"
          type="submit"
          disabled={loading}
        >
          {loading
            ? "處理中..."
            : mode === "login"
              ? "登入"
              : mode === "signup"
                ? "建立帳號"
                : "寄送重設密碼連結"}
        </button>

        {mode === "login" && (
          <div className="auth-options">
            <button
              type="button"
              onClick={() =>
                switchMode("signup")
              }
              disabled={loading}
            >
              建立帳號
            </button>

            <button
              type="button"
              onClick={() =>
                switchMode("forgot")
              }
              disabled={loading}
            >
              忘記密碼？
            </button>
          </div>
        )}

        {mode !== "login" && (
          <button
            type="button"
            className="auth-back"
            onClick={() =>
              switchMode("login")
            }
            disabled={loading}
          >
            返回登入
          </button>
        )}

        {message && (
          <div
            className="login-note"
            role="status"
            aria-live="polite"
          >
            {message}
          </div>
        )}
      </form>
    </section>
  );
}