import { create } from "zustand";
import { api } from "../api/client";

interface AuthStore {
  authenticated: boolean;
  username: string | null;
  checking: boolean;

  initialized: boolean | null;
  authMethod: "local" | "oidc" | null;
  oidcProvider: { name: string; issuer: string } | null;

  checkStatus: () => Promise<void>;
  login: (username: string, password: string) => Promise<boolean>;
  checkSession: () => Promise<void>;
  logout: () => Promise<void>;
  setupLocal: (username: string, password: string, displayName?: string) => Promise<boolean>;
  setupOidc: (config: { issuer: string; clientId: string; clientSecret: string; providerName: string }) => Promise<string | null>;
  beginOidcLogin: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  authenticated: false,
  username: null,
  checking: true,

  initialized: null,
  authMethod: null,
  oidcProvider: null,

  checkStatus: async () => {
    try {
      const status = await api.getAuthStatus();
      set({
        initialized: status.initialized,
        authMethod: status.authMethod,
        oidcProvider: status.oidcProvider,
      });
    } catch {
      set({ initialized: null });
    }
  },

  login: async (username, password) => {
    try {
      const res = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) return false;
      const json = await res.json();
      set({ authenticated: true, username: json.data?.username ?? username });
      return true;
    } catch {
      return false;
    }
  },

  checkSession: async () => {
    // First check app status
    await get().checkStatus();
    const { initialized } = get();

    if (initialized === false) {
      set({ checking: false });
      return;
    }

    try {
      const session = await api.getSession();
      set({ authenticated: true, checking: false, username: session.username });
    } catch {
      set({ authenticated: false, checking: false, username: null });
    }
  },

  logout: async () => {
    try {
      await api.logout();
    } finally {
      set({ authenticated: false, username: null });
    }
  },

  setupLocal: async (username, password, displayName?) => {
    try {
      const result = await api.setup({ method: "local", username, password, displayName });
      set({
        initialized: true,
        authMethod: "local",
        authenticated: true,
        username: result.username ?? username,
      });
      return true;
    } catch {
      return false;
    }
  },

  setupOidc: async (config) => {
    try {
      await api.setup({ method: "oidc", ...config });
      set({ initialized: true, authMethod: "oidc", oidcProvider: { name: config.providerName, issuer: config.issuer } });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "설정에 실패했습니다.";
    }
  },

  beginOidcLogin: async () => {
    try {
      const result = await api.getOidcAuthorizeUrl();
      window.location.href = result.redirectUrl;
    } catch {
      // Ignore - user will stay on login page
    }
  },
}));
