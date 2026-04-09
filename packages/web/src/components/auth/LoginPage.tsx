import { useEffect, useId, useState, type FormEvent } from "react";
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
      className="ui-screen h-full flex items-center justify-center px-4"
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
  const usernameId = useId();
  const passwordId = useId();

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
      className="ui-card rounded-[var(--radius-panel)] p-6"
    >
      <div className="ui-field mb-4">
        <label
          htmlFor={usernameId}
          className="ui-label"
        >
          Username
        </label>
        <input
          id={usernameId}
          name="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          required
          className="ui-input text-sm"
        />
      </div>

      <div className="ui-field mb-5">
        <label
          htmlFor={passwordId}
          className="ui-label"
        >
          Password
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="ui-input text-sm"
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
        className="ui-button ui-button--solid w-full text-sm font-medium"
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
      className="ui-card rounded-[var(--radius-panel)] p-6"
    >
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={loading}
        className="ui-button ui-button--solid w-full text-sm font-medium"
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
