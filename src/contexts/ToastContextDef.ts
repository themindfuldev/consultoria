import { createContext } from 'react';

export interface ToastContextValue {
  /** Shows a transient toast message that auto-dismisses after ~2s. */
  showToast: (message: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
