export default function VerifiedPage() {
  return (
    <main className="login-screen">
      <div className="login-card">
        <div className="login-brand-name">
          Next@NTU
        </div>

        <div
          style={{
            marginTop: "24px",
            textAlign: "center",
          }}
        >
          <h1
            style={{
              fontSize: "20px",
              marginBottom: "12px",
            }}
          >
            Email 驗證成功
          </h1>

          <p
            style={{
              color: "#888",
              fontSize: "13px",
              lineHeight: 1.6,
            }}
          >
            你的帳號已完成驗證，
            現在可以回到 Next@NTU 登入。
          </p>

          <a
            href="/"
            className="login-submit"
            style={{
              display: "grid",
              placeItems: "center",
              textDecoration: "none",
              marginTop: "24px",
            }}
          >
            回到登入頁
          </a>
        </div>
      </div>
    </main>
  );
}