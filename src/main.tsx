import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { OfflineSession } from './pages/OfflineSession';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Elemento root não encontrado no DOM.');

// The offline snapshot viewer is fully static (localStorage only). When opened
// directly (new tab), render it OUTSIDE AuthProvider so it never touches
// Firebase/Google auth — it works irrespective of login.
const isOfflineEntry = window.location.pathname.startsWith('/offline/');

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      {isOfflineEntry ? (
        <Routes>
          <Route path="/offline/:sessionId" element={<OfflineSession />} />
        </Routes>
      ) : (
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      )}
    </BrowserRouter>
  </StrictMode>,
);
