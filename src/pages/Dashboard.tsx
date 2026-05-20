import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

export const Dashboard: React.FC = () => {
  const { profile, logout } = useAuth();
  const { t } = useLanguage();

  return (
    <div className="p-6">
      <div className="glass-premium rounded-3xl p-6 shadow-lg mb-6">
        <h1 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 mb-2">
          {profile?.role === 'trainer' ? t('trainerDashboard') : t('studentDashboard')}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Welcome, {profile?.displayName}! ({profile?.email})
        </p>
      </div>

      <div className="flex gap-4">
        <button 
          onClick={logout}
          className="bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 px-6 rounded-xl shadow cursor-pointer transition"
        >
          {t('logout')}
        </button>
      </div>
    </div>
  );
};
