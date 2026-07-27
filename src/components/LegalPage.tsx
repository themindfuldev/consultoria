import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Moon, Sun } from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';

interface LegalPageProps {
  title: string;
  /** Human-readable "last updated" date, e.g. "27 de julho de 2026". */
  updatedAt: string;
  children: ReactNode;
}

/**
 * Shared shell for the public legal pages (Privacy Policy, Terms of Service).
 * These live at stable, login-free URLs (`/privacidade`, `/termos`) so they can
 * be referenced from the Google OAuth consent screen configuration.
 */
export function LegalPage({ title, updatedAt, children }: LegalPageProps) {
  const { isDark, toggle } = useDarkMode();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-200">
      <div className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
          <button
            onClick={toggle}
            aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
            className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>

        <div className="mb-8 flex items-center gap-3">
          <img src="/app-icon.png" alt="Consultoria" className="h-10 w-10 rounded-xl shadow" />
          <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Consultoria
          </span>
        </div>

        <h1 className="mb-1 text-3xl font-black tracking-tight text-slate-900 dark:text-white">
          {title}
        </h1>
        <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
          Última atualização: {updatedAt}
        </p>

        {/* Body — spacing/typography shared across sections */}
        <div className="space-y-6 text-[15px] leading-relaxed [&_a]:font-medium [&_a]:text-indigo-600 [&_a]:underline [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-slate-900 [&_li]:ml-1 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 dark:[&_a]:text-indigo-400 dark:[&_h2]:text-white">
          {children}
        </div>
      </div>
    </div>
  );
}
