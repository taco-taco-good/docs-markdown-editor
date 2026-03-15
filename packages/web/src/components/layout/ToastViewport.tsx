import { useEffect } from "react";
import { useUIStore } from "../../stores/ui.store";

export function ToastViewport() {
  const toast = useUIStore((s) => s.toast);
  const clearToast = useUIStore((s) => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => clearToast(), 3200);
    return () => clearTimeout(timer);
  }, [toast, clearToast]);

  if (!toast) return null;

  return (
    <div className="toast-viewport" role="status" aria-live="polite">
      <div className="toast" data-tone={toast.tone}>
        {toast.message}
      </div>
    </div>
  );
}
