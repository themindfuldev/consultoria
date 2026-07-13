import { createContext } from 'react';

export interface ToastContextValue {
  /**
   * Shows a transient toast message that auto-dismisses on its own. Defaults to
   * ~2s; pass `durationMs` to override (e.g. a longer 3s heads-up).
   */
  showToast: (message: string, durationMs?: number) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
