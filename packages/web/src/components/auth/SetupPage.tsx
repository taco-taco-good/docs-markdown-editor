import { useState, type FormEvent } from "react";
import { useAuthStore } from "../../stores/auth.store";
import { BrandLockup } from "../brand/Brand";

type Step = "choose" | "local" | "oidc";

export function SetupPage() {
  const [step, setStep] = useState<Step>("choose");

  return (
    <div
      className="h-full flex items-center justify-center"
      style={{
        background: "radial-gradient(circle at top, color-mix(in srgb, var(--color-accent) 10%, var(--color-surface-0)) 0%, var(--color-surface-0) 42%)",
      }}
    >
      <div className="w-full max-w-md animate-slide-up px-4">
        <div className="mb-10">
          <BrandLockup size={36} />
        </div>

        {step === "choose" && <ChooseMethod onSelect={setStep} />}
        {step === "local" && <LocalSetup onBack={() => setStep("choose")} />}
        {step === "oidc" && <OidcSetup onBack={() => setStep("choose")} />}
      </div>
    </div>
  );
}

function ChooseMethod({ onSelect }: { onSelect: (step: Step) => void }) {
  return (
    <div
      className="rounded-xl p-6"
      style={{
        background: "var(--color-surface-2)",
        border: "1px solid var(--color-border)",
      }}
    >
      <h2
        className="text-base font-semibold mb-1"
        style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-ui)" }}
      >
        초기 설정
      </h2>
      <p className="text-xs mb-6" style={{ color: "var(--color-text-tertiary)" }}>
        인증 방식을 선택하세요
      </p>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => onSelect("local")}
          className="w-full text-left rounded-lg p-4 transition-colors"
          style={{
            background: "var(--color-surface-3)",
            border: "1px solid var(--color-border)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--color-accent)")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "var(--color-surface-4)" }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-accent)" }}>
                <circle cx="8" cy="5" r="3" />
                <path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                로컬 계정 생성
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                사용자 이름과 비밀번호로 로그인합니다
              </div>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSelect("oidc")}
          className="w-full text-left rounded-lg p-4 transition-colors"
          style={{
            background: "var(--color-surface-3)",
            border: "1px solid var(--color-border)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--color-accent)")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "var(--color-surface-4)" }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-green)" }}>
                <rect x="1.5" y="3" width="13" height="10" rx="1.5" />
                <path d="M5 8h6M8 5v6" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                외부 인증 연동 (OIDC)
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                Authentik, Keycloak, Google 등 외부 서비스를 사용합니다
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

function LocalSetup({ onBack }: { onBack: () => void }) {
  const setupLocal = useAuthStore((s) => s.setupLocal);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 4) {
      setError("비밀번호는 4자 이상이어야 합니다.");
      return;
    }
    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setLoading(true);
    const ok = await setupLocal(username, password, displayName || undefined);
    if (!ok) {
      setError("계정 생성에 실패했습니다.");
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
      <div className="flex items-center gap-2 mb-5">
        <button
          type="button"
          onClick={onBack}
          className="w-7 h-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--color-surface-3)]"
          style={{ color: "var(--color-text-muted)" }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3L5 8l5 5" />
          </svg>
        </button>
        <h2
          className="text-base font-semibold"
          style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-ui)" }}
        >
          로컬 계정 생성
        </h2>
      </div>

      <SetupInput label="사용자 이름" value={username} onChange={setUsername} autoFocus required />
      <SetupInput label="표시 이름" value={displayName} onChange={setDisplayName} placeholder="선택 사항" />
      <SetupInput label="비밀번호" type="password" value={password} onChange={setPassword} required />
      <SetupInput label="비밀번호 확인" type="password" value={confirmPassword} onChange={setConfirmPassword} required />

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
        {loading ? "생성 중…" : "계정 생성"}
      </button>
    </form>
  );
}

function OidcSetup({ onBack }: { onBack: () => void }) {
  const setupOidc = useAuthStore((s) => s.setupOidc);
  const beginOidcLogin = useAuthStore((s) => s.beginOidcLogin);
  const [providerName, setProviderName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const err = await setupOidc({ issuer, clientId, clientSecret, providerName });
    if (err) {
      if (err.includes("OIDC") || err.includes("fetch")) {
        setError("OIDC 공급자에 연결할 수 없습니다. URL을 확인해주세요.");
      } else {
        setError(err);
      }
    } else {
      setDone(true);
    }
    setLoading(false);
  };

  if (done) {
    return (
      <div
        className="rounded-xl p-6 text-center"
        style={{
          background: "var(--color-surface-2)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: "var(--color-surface-3)" }}
        >
          <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-success)" }}>
            <path d="M3 8.5l3 3 7-7" />
          </svg>
        </div>
        <h2
          className="text-base font-semibold mb-2"
          style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-ui)" }}
        >
          연동 완료
        </h2>
        <p className="text-xs mb-6" style={{ color: "var(--color-text-tertiary)" }}>
          {providerName}이(가) 성공적으로 연동되었습니다.
        </p>
        <button
          type="button"
          onClick={() => void beginOidcLogin()}
          className="w-full h-9 rounded-md text-sm font-medium transition-all duration-150"
          style={{
            background: "var(--color-accent)",
            color: "var(--color-surface-0)",
            cursor: "pointer",
          }}
        >
          {providerName}(으)로 로그인
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl p-6"
      style={{
        background: "var(--color-surface-2)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center gap-2 mb-5">
        <button
          type="button"
          onClick={onBack}
          className="w-7 h-7 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--color-surface-3)]"
          style={{ color: "var(--color-text-muted)" }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3L5 8l5 5" />
          </svg>
        </button>
        <h2
          className="text-base font-semibold"
          style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-ui)" }}
        >
          외부 인증 연동 (OIDC)
        </h2>
      </div>

      <SetupInput label="공급자 이름" value={providerName} onChange={setProviderName} placeholder="예: Authentik, Google" autoFocus required />
      <SetupInput label="Issuer URL" value={issuer} onChange={setIssuer} placeholder="https://auth.example.com/application/o/myapp" required />
      <SetupInput label="Client ID" value={clientId} onChange={setClientId} required />
      <SetupInput label="Client Secret" type="password" value={clientSecret} onChange={setClientSecret} required />

      <p className="text-[11px] mb-4" style={{ color: "var(--color-text-muted)" }}>
        Redirect URI: <code className="px-1 py-0.5 rounded text-[10px]" style={{ background: "var(--color-surface-3)" }}>{window.location.origin}/auth/oidc/callback</code>
      </p>

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
        {loading ? "연결 확인 중…" : "연결 확인 및 저장"}
      </button>
    </form>
  );
}

function SetupInput({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoFocus,
  required,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  required?: boolean;
}) {
  return (
    <div className="mb-4">
      <label
        className="block text-[11px] font-medium uppercase tracking-wider mb-1.5"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        required={required}
        className="w-full h-9 px-3 rounded-md text-sm outline-none transition-colors"
        style={{
          background: "var(--color-surface-3)",
          color: "var(--color-text-primary)",
          border: "1px solid var(--color-border)",
          caretColor: "var(--color-accent)",
          fontFamily: "var(--font-ui)",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-accent)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
      />
    </div>
  );
}
