import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContextDef';
import type { AuthContextValue } from '../contexts/AuthContextDef';

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
