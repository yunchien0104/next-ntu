"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleReset(e: FormEvent) {
    e.preventDefault();

    if (password.length < 8) {
      setMessage("密碼至少需要 8 個字元");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("兩次輸入的密碼不一致");
      return;
    }

    setLoading(true);

    const { error } =
      await supabase.auth.updateUser({
        password,
      });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("密碼已更新，可以重新登入。");
  }

  return (
    <main className="login-screen">
      <form
        className="login-card"
        onSubmit={handleReset}
      >
        <div className="login-brand-name">
          Next@NTU
        </div>

        <div className="login-field">
          <label>新密碼</label>

          <input
            type="password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
          />
        </div>

        <div className="login-field">
          <label>再次輸入新密碼</label>

          <input
            type="password"
            value={confirmPassword}
            onChange={(e) =>
              setConfirmPassword(e.target.value)
            }
          />
        </div>

        <button
          className="login-submit"
          type="submit"
          disabled={loading}
        >
          {loading
            ? "更新中..."
            : "設定新密碼"}
        </button>

        {message && (
          <div className="login-note">
            {message}
          </div>
        )}
      </form>
    </main>
  );
}