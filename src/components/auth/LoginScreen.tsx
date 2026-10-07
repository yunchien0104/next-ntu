"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

type AuthMode = "login" | "signup" | "forgot";

type LoginScreenProps = {
  onLoginSuccess: () => void;
};

export function LoginScreen({
  onLoginSuccess,
}: LoginScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setMessage("");
    setPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage("");

    // Forgot password
    if (mode === "forgot") {
      if (!email) {
        setMessage("請輸入 Email");
        return;
      }

      setLoading(true);

      const { error } =
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });

      setLoading(false);

      if (error) {
        setMessage(error.message);
        return;
      }

      setMessage("重設密碼連結已寄到你的信箱。");
      return;
    }

    // Login + Signup need email/password
    if (!email || !password) {
      setMessage("請輸入 Email 與密碼");
      return;
    }

    // Signup
    if (mode === "signup") {
      if (password.length < 8) {
        setMessage("密碼至少需要 8 個字元");
        return;
      }

      if (password !== confirmPassword) {
        setMessage("兩次輸入的密碼不一致");
        return;
      }

      setLoading(true);

      const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
      emailRedirectTo:`${window.location.origin}/auth/verified`,
          },
        });

      setLoading(false);

      if (error) {
        setMessage(error.message);
        return;
      }

      if (data.session) {
        onLoginSuccess();
        return;
      }

      setMessage("帳號建立成功，請至信箱完成驗證。");
      setMode("login");
      return;
    }

    // Login
    setLoading(true);

    const { error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    onLoginSuccess();
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
            onChange={(e) =>
              setEmail(e.target.value)
            }
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
              onChange={(e) =>
                setPassword(e.target.value)
              }
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
              onChange={(e) =>
                setConfirmPassword(e.target.value)
              }
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
            >
              建立帳號
            </button>

            <button
              type="button"
              onClick={() =>
                switchMode("forgot")
              }
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
          >
            返回登入
          </button>
        )}

        {message && (
          <div className="login-note">
            {message}
          </div>
        )}
      </form>
    </section>
  );
}