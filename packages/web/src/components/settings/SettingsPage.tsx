import { useEffect, useState } from "react";
import { api, type PersonalAccessToken } from "../../api/client";
import { useUIStore } from "../../stores/ui.store";
import { useAuthStore } from "../../stores/auth.store";
import { darkThemes, lightThemes } from "../../lib/themes";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
}

function timeAgo(iso: string | null): string {
  if (!iso) return "사용 기록 없음";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return formatDate(iso);
}

export function SettingsPage() {
  const closeSettings = useUIStore((s) => s.closeSettings);
  const showToast = useUIStore((s) => s.showToast);
  const themeId = useUIStore((s) => s.themeId);
  const setTheme = useUIStore((s) => s.setTheme);
  const username = useAuthStore((s) => s.username);

  const [tokens, setTokens] = useState<PersonalAccessToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTokenName, setNewTokenName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadTokens = async () => {
    try {
      const data = await api.getTokens();
      setTokens(data);
    } catch {
      showToast("토큰 목록을 불러오지 못했습니다.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTokens();
  }, []);

  const handleCreate = async () => {
    const name = newTokenName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const result = await api.createToken(name);
      setCreatedToken(result.token);
      setNewTokenName("");
      setCopied(false);
      await loadTokens();
    } catch {
      showToast("토큰 생성에 실패했습니다.", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (tokenId: string) => {
    setRevokingId(tokenId);
    try {
      await api.revokeToken(tokenId);
      setTokens((prev) => prev.filter((t) => t.id !== tokenId));
      showToast("토큰이 삭제되었습니다.");
    } catch {
      showToast("토큰 삭제에 실패했습니다.", "error");
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopy = async () => {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("클립보드 복사에 실패했습니다.", "error");
    }
  };

  return (
    <div className="settings-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeSettings(); }}>
      <div className="settings-panel">
        {/* Header */}
        <div className="settings-header">
          <h2 className="settings-title">설정</h2>
          <button
            type="button"
            className="settings-close"
            onClick={closeSettings}
            aria-label="닫기"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className="settings-body">
          {/* Profile section */}
          <section className="settings-section">
            <h3 className="settings-section-title">프로필</h3>
            <div className="settings-card">
              <div className="settings-profile">
                <div className="settings-avatar">
                  {username?.charAt(0).toUpperCase() ?? "?"}
                </div>
                <div>
                  <div className="settings-username">{username}</div>
                  <div className="settings-provider">로컬 계정</div>
                </div>
              </div>
            </div>
          </section>

          {/* Theme section */}
          <section className="settings-section">
            <h3 className="settings-section-title">테마</h3>
            <div className="settings-theme-scroll">
              <h4 className="settings-theme-group-title">Dark</h4>
              <div className="settings-theme-grid">
                {darkThemes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="settings-theme-card"
                    data-active={t.id === themeId ? "true" : "false"}
                    onClick={() => setTheme(t.id)}
                  >
                    <div className="settings-theme-preview">
                      <span className="settings-theme-swatch" style={{ background: t.colors["surface-2"] }} />
                      <span className="settings-theme-swatch" style={{ background: t.colors.accent }} />
                      <span className="settings-theme-swatch" style={{ background: t.colors["text-primary"] }} />
                      <span className="settings-theme-swatch" style={{ background: t.colors.danger }} />
                      <span className="settings-theme-swatch" style={{ background: t.colors.success }} />
                    </div>
                    <span className="settings-theme-name">{t.name}</span>
                  </button>
                ))}
              </div>
              <h4 className="settings-theme-group-title">Light</h4>
              <div className="settings-theme-grid">
                {lightThemes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="settings-theme-card"
                    data-active={t.id === themeId ? "true" : "false"}
                    onClick={() => setTheme(t.id)}
                  >
                    <div className="settings-theme-preview">
                      <span className="settings-theme-swatch" style={{ background: t.colors["surface-2"] }} />
                      <span className="settings-theme-swatch" style={{ background: t.colors.accent }} />
                      <span className="settings-theme-swatch" style={{ background: t.colors["text-primary"] }} />
                      <span className="settings-theme-swatch" style={{ background: t.colors.danger }} />
                      <span className="settings-theme-swatch" style={{ background: t.colors.success }} />
                    </div>
                    <span className="settings-theme-name">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* API Tokens section */}
          <section className="settings-section">
            <h3 className="settings-section-title">API 토큰</h3>
            <p className="settings-description">
              외부 도구나 AI 에이전트가 API에 접근할 수 있도록 개인 액세스 토큰을 발급합니다.
            </p>

            {/* Token creation */}
            <div className="settings-card">
              <div className="settings-token-create">
                <input
                  type="text"
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
                  placeholder="토큰 이름 (예: claude-desktop)"
                  className="settings-input"
                  disabled={creating}
                />
                <button
                  type="button"
                  className="settings-btn settings-btn--primary"
                  onClick={() => void handleCreate()}
                  disabled={creating || !newTokenName.trim()}
                >
                  {creating ? "생성 중…" : "생성"}
                </button>
              </div>

              {/* Newly created token display */}
              {createdToken ? (
                <div className="settings-token-created">
                  <div className="settings-token-created__notice">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <circle cx="8" cy="8" r="6.5" />
                      <path d="M8 5v3" />
                      <circle cx="8" cy="11" r="0.5" fill="currentColor" />
                    </svg>
                    <span>이 토큰은 다시 확인할 수 없습니다. 지금 복사하세요.</span>
                  </div>
                  <div className="settings-token-created__value">
                    <code className="settings-token-created__code">{createdToken}</code>
                    <button
                      type="button"
                      className="settings-btn settings-btn--small"
                      onClick={() => void handleCopy()}
                    >
                      {copied ? "복사됨" : "복사"}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="settings-token-created__dismiss"
                    onClick={() => setCreatedToken(null)}
                  >
                    확인
                  </button>
                </div>
              ) : null}
            </div>

            {/* Token list */}
            <div className="settings-card">
              {loading ? (
                <div className="settings-empty">불러오는 중…</div>
              ) : tokens.length === 0 ? (
                <div className="settings-empty">발급된 토큰이 없습니다.</div>
              ) : (
                <div className="settings-token-list">
                  {tokens.map((token) => (
                    <div key={token.id} className="settings-token-item">
                      <div className="settings-token-info">
                        <div className="settings-token-name">{token.name}</div>
                        <div className="settings-token-meta">
                          <span className="settings-token-prefix">{token.tokenPrefix}…</span>
                          <span className="settings-token-sep" />
                          <span>생성: {formatDate(token.createdAt)}</span>
                          <span className="settings-token-sep" />
                          <span>마지막 사용: {timeAgo(token.lastUsedAt)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="settings-btn settings-btn--danger"
                        onClick={() => void handleRevoke(token.id)}
                        disabled={revokingId === token.id}
                      >
                        {revokingId === token.id ? "삭제 중…" : "삭제"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Usage guide */}
            <div className="settings-card settings-usage">
              <h4 className="settings-usage__title">사용 방법</h4>
              <p className="settings-usage__text">
                API 요청 시 Authorization 헤더에 토큰을 포함하세요:
              </p>
              <code className="settings-usage__code">
                Authorization: Bearer pat_xxxxxxxxxxxx...
              </code>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
