import { useContext } from 'react';
import { ToastContext } from '../contexts/ToastContextDef';
import type { ToastContextValue } from '../contexts/ToastContextDef';

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider');
  return ctx;
}
