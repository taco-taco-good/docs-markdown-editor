import { lazy, Suspense, useEffect } from "react";
import { LoginPage } from "./components/auth/LoginPage";
import { SetupPage } from "./components/auth/SetupPage";
import { useAuthStore } from "./stores/auth.store";

const AuthenticatedApp = lazy(async () => import("./components/app/AuthenticatedApp").then((module) => ({
  default: module.AuthenticatedApp,
})));

export function App() {
  const authenticated = useAuthStore((s) => s.authenticated);
  const checking = useAuthStore((s) => s.checking);
  const initialized = useAuthStore((s) => s.initialized);
  const checkSession = useAuthStore((s) => s.checkSession);

  // Check status + session on mount
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Show loading while checking
  if (checking) {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{ background: "var(--color-surface-0)" }}
      >
        <div
          className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  // First-time setup
  if (initialized === false) {
    return <SetupPage />;
  }

  if (!authenticated) {
    return <LoginPage />;
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <AuthenticatedApp />
    </Suspense>
  );
}

function LoadingScreen() {
  return (
    <div
      className="h-full flex items-center justify-center"
      style={{
        background: "var(--color-surface-0)",
      }}
    >
      <div
        className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }}
      />
    </div>
  );
}
