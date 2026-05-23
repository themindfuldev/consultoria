import { useEffect, useState } from 'react';

/** Manages the `dark` class on <html> and persists the preference to localStorage. */
export function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    try {
      const stored = localStorage.getItem('theme');
      if (stored) return stored === 'dark';
    } catch {
      // localStorage not available (private browsing, etc.)
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try {
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [isDark]);

  const toggle = () => setIsDark((d) => !d);
  return { isDark, toggle };
}
