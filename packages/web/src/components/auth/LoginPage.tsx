import { useState, useEffect, type FormEvent } from "react";
import { useAuthStore } from "../../stores/auth.store";
import { BrandLockup } from "../brand/Brand";

export function LoginPage() {
  const authMethod = useAuthStore((s) => s.authMethod);
  const oidcProvider = useAuthStore((s) => s.oidcProvider);

  // Check URL for OIDC error
  const [authError, setAuthError] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("auth_error");
    if (error) {
      setAuthError("인증에 실패했습니다. 다시 시도해주세요.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  return (
    <div
      className="h-full flex items-center justify-center px-4"
      style={{
        background: "radial-gradient(circle at top, color-mix(in srgb, var(--color-accent) 10%, var(--color-surface-0)) 0%, var(--color-surface-0) 42%)",
      }}
    >
      <div className="w-full max-w-sm animate-slide-up">
        <div className="mb-10">
          <BrandLockup size={36} />
        </div>

        {authError && (
          <p className="text-xs mb-4 text-center animate-fade-in" style={{ color: "var(--color-danger)" }}>
            {authError}
          </p>
        )}

        {authMethod === "oidc" ? (
          <OidcLoginForm providerName={oidcProvider?.name ?? "OIDC"} />
        ) : (
          <LocalLoginForm />
        )}
      </div>
    </div>
  );
}

function LocalLoginForm() {
  const login = useAuthStore((s) => s.login);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const ok = await login(username, password);
    if (!ok) {
      setError("아이디 또는 비밀번호가 올바르지 않습니다.");
    }
    setLoading(false);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl p-6"
      style={{
        background: "var(--color-surface-2)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="mb-4">
        <label
          className="block text-[11px] font-medium uppercase tracking-wider mb-1.5"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Username
        </label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          required
          className="w-full h-9 px-3 rounded-md text-sm outline-none transition-colors"
          style={{
            background: "var(--color-surface-3)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border)",
            caretColor: "var(--color-accent)",
            fontFamily: "var(--font-ui)",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--color-accent)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
        />
      </div>

      <div className="mb-5">
        <label
          className="block text-[11px] font-medium uppercase tracking-wider mb-1.5"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full h-9 px-3 rounded-md text-sm outline-none transition-colors"
          style={{
            background: "var(--color-surface-3)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border)",
            caretColor: "var(--color-accent)",
            fontFamily: "var(--font-ui)",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--color-accent)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
        />
      </div>

      {error && (
        <p className="text-xs mb-4 animate-fade-in" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full h-9 rounded-md text-sm font-medium transition-all duration-150"
        style={{
          background: loading ? "var(--color-surface-4)" : "var(--color-accent)",
          color: loading ? "var(--color-text-muted)" : "var(--color-surface-0)",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "로그인 중…" : "로그인"}
      </button>
    </form>
  );
}

function OidcLoginForm({ providerName }: { providerName: string }) {
  const beginOidcLogin = useAuthStore((s) => s.beginOidcLogin);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    await beginOidcLogin();
  };

  return (
    <div
      className="rounded-xl p-6"
      style={{
        background: "var(--color-surface-2)",
        border: "1px solid var(--color-border)",
      }}
    >
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={loading}
        className="w-full h-10 rounded-md text-sm font-medium transition-all duration-150 flex items-center justify-center gap-2"
        style={{
          background: loading ? "var(--color-surface-4)" : "var(--color-accent)",
          color: loading ? "var(--color-text-muted)" : "var(--color-surface-0)",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1.5" y="3" width="13" height="10" rx="1.5" />
          <path d="M5 8h6M8 5v6" />
        </svg>
        {loading ? "리다이렉트 중…" : `${providerName}(으)로 로그인`}
      </button>
    </div>
  );
}
