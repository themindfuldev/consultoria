import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ToastContext } from './ToastContextDef';

/** How long a toast stays on screen before auto-dismissing. */
const TOAST_DURATION_MS = 3000;

interface Toast {
  id: number;
  message: string;
}

/**
 * App-wide transient toast messages. Call `showToast(text)` (via `useToast`)
 * from anywhere below the provider; the toast appears bottom-center and fades
 * out on its own after ~3s. Used for lightweight confirmations like a
 * successful video upload.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, durationMs = TOAST_DURATION_MS) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, durationMs);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Sits well above the bottom edge on phones so it clears iOS Safari's
          floating toolbar / home-indicator (which would otherwise hide it);
          drops back to a tight offset on larger screens. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg animate-toast-in"
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
