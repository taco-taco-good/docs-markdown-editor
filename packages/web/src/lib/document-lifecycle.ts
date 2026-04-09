export interface LifecycleSaveOptions {
  keepalive?: boolean;
}

export interface LifecycleStore {
  flushPendingSave: (options?: LifecycleSaveOptions) => Promise<void> | void;
}

interface RegisterDocumentPersistenceLifecycleOptions {
  document: Document;
  window: Window;
  store: LifecycleStore;
}

const FLUSH_SUPPRESSION_MS = 400;

export function registerDocumentPersistenceLifecycle(
  options: RegisterDocumentPersistenceLifecycleOptions,
): () => void {
  const { document, window, store } = options;

  let lastFlushAt = 0;

  const flushNow = () => {
    const now = Date.now();
    if (now - lastFlushAt < FLUSH_SUPPRESSION_MS) {
      return;
    }
    lastFlushAt = now;
    void store.flushPendingSave({ keepalive: true });
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      flushNow();
    }
  };

  const handlePageHide = () => {
    flushNow();
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", handlePageHide);

  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("pagehide", handlePageHide);
  };
}
