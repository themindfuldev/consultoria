import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Dumbbell, Globe, Sparkles } from 'lucide-react';

export const Landing: React.FC = () => {
  const { login, createProfile } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const [showRoleSelection, setShowRoleSelection] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setError(null);
    try {
      const existingProfile = await login();
      if (!existingProfile) {
        // New user - trigger role selection modal
        setShowRoleSelection(true);
      }
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    }
  };

  const handleRoleSelect = async (role: UserRole) => {
    try {
      await createProfile(role, language);
      setShowRoleSelection(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to set profile');
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'pt-BR' : 'en');
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-4 overflow-hidden">
      {/* Dynamic Animated background */}
      <div className="absolute inset-0 z-0 animated-gradient opacity-10 dark:opacity-20" />
      <div className="absolute top-10 right-10 z-10 flex items-center gap-4">
        {/* Language selector */}
        <button 
          onClick={toggleLanguage}
          className="glass hover:bg-white/20 dark:hover:bg-slate-800/30 px-3 py-1.5 rounded-full flex items-center gap-2 text-sm font-medium transition cursor-pointer"
        >
          <Globe size={16} />
          <span>{language === 'en' ? 'PT-BR' : 'EN'}</span>
        </button>
      </div>

      <div className="w-full max-w-md z-10">
        {/* Card wrapper with premium glassmorphism */}
        <div className="glass-premium rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center">
          <div className="bg-purple-600 dark:bg-purple-500 p-4 rounded-2xl text-white shadow-lg shadow-purple-500/30 mb-6 animate-bounce">
            <Dumbbell size={36} />
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-400 dark:to-indigo-400 bg-clip-text text-transparent mb-2">
            {t('appName')}
          </h1>
          <p className="text-sm font-medium tracking-wide text-purple-600 dark:text-purple-400 uppercase mb-4 flex items-center gap-1.5 justify-center">
            <Sparkles size={14} />
            {t('tagline')}
          </p>

          <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-8">
            {t('loginSubtitle')}
          </p>

          {error && (
            <div className="w-full p-3 mb-4 text-xs font-semibold bg-red-100 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl">
              {error}
            </div>
          )}

          <button
            onClick={handleSignIn}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-3.5 px-6 rounded-2xl shadow-lg hover:shadow-purple-500/20 active:scale-95 transition-all duration-150 cursor-pointer flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.73 0 3.3.63 4.5 1.67l2.42-2.42C17.37 1.75 14.93 1 12.24 1 6.58 1 2 5.58 2 11.24s4.58 10.24 10.24 10.24c5.79 0 10.24-4.11 10.24-10.24 0-.69-.06-1.35-.18-1.95H12.24z"/>
            </svg>
            {t('signInWithGoogle')}
          </button>
        </div>
      </div>

      {/* Role Selection Modal */}
      {showRoleSelection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm transition-all">
          <div className="glass-premium rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border border-white/20">
            <h2 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 mb-2">
              {t('roleSelectionTitle')}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 leading-relaxed">
              {t('roleSelectionSubtitle')}
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleRoleSelect('trainer')}
                className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-purple-600 hover:text-white dark:hover:bg-purple-600 font-bold py-3.5 px-6 rounded-2xl text-slate-700 dark:text-slate-200 transition-all border border-slate-200 dark:border-slate-700/50 cursor-pointer"
              >
                {t('iAmTrainer')}
              </button>
              <button
                onClick={() => handleRoleSelect('student')}
                className="w-full bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 font-bold py-3.5 px-6 rounded-2xl text-slate-700 dark:text-slate-200 transition-all border border-slate-200 dark:border-slate-700/50 cursor-pointer"
              >
                {t('iAmStudent')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
