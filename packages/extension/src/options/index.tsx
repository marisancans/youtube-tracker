import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Loader2 } from 'lucide-react';
import Settings from './Settings';
import Dashboard from './Dashboard';
import Onboarding from './Onboarding';
import '../styles/globals.css';

type Page = 'settings' | 'dashboard';

function getPageFromHash(): Page {
  return window.location.hash === '#dashboard' ? 'dashboard' : 'settings';
}

function AuthRequiredPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = () => {
    setLoading(true);
    setError(null);
    chrome.runtime.sendMessage({ type: 'AUTH_SIGN_IN' }, (response) => {
      setLoading(false);
      if (!response?.success) {
        setError(response?.error || 'Sign in failed');
      }
      // On success, storage listener in App will detect authState change
    });
  };

  return (
    <div className="min-h-screen bg-ocean-gradient flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-navy-light/90 backdrop-blur border border-gold/20 rounded-2xl p-8 text-center">
        <div className="mb-6">
          <svg className="w-16 h-16 mx-auto text-gold/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 className="text-2xl font-display text-parchment mb-2">Sign In Required</h1>
        <p className="text-parchment-dark/70 font-body text-sm mb-8 leading-relaxed">
          Sign in with Google to track your YouTube usage and sync across devices.
        </p>
        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full py-3.5 bg-navy/50 border-2 border-gold/40 text-parchment rounded-xl font-semibold font-body flex items-center justify-center gap-2.5 hover:border-gold/70 hover:bg-navy/70 transition-all disabled:opacity-50 active:scale-[0.98]"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-gold" />
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          )}
          Sign in with Google
        </button>
        {error && <p className="text-storm-red text-sm mt-3 font-body">{error}</p>}
      </div>
    </div>
  );
}

function App() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>(getPageFromHash);

  // Listen for hash changes (back/forward navigation)
  useEffect(() => {
    const onHashChange = () => setPage(getPageFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    // Check onboarding + auth state
    chrome.storage.local.get(['onboardingCompleted', 'settings', 'authState'], (result) => {
      setShowOnboarding(!result.onboardingCompleted);
      setAuthed(!!result.authState?.user);
      setLoading(false);
    });

    // Listen for auth state changes
    const onChanged = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.authState) {
        setAuthed(!!changes.authState.newValue?.user);
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const handleOnboardingComplete = async (settings: { goalMode: string; dailyGoalMinutes: number; restored?: boolean }) => {
    if (settings.restored) {
      // Data restored from server — don't overwrite settings, just mark onboarding done
      await chrome.storage.local.set({ onboardingCompleted: true });
    } else {
      // Fresh setup — save chosen settings
      const existingSettings = (await chrome.storage.local.get('settings')).settings || {};
      const newSettings = {
        ...existingSettings,
        goalMode: settings.goalMode,
        dailyGoalMinutes: settings.dailyGoalMinutes,
        phase: 'observation',
        installDate: Date.now(),
      };

      await chrome.storage.local.set({
        settings: newSettings,
        onboardingCompleted: true,
      });

      chrome.runtime.sendMessage({ type: 'SET_GOAL_MODE', data: { mode: settings.goalMode } });
    }

    setShowOnboarding(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-white rounded-full" />
      </div>
    );
  }

  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  // Auth gate — must be signed in after onboarding
  if (!authed) {
    return <AuthRequiredPage />;
  }

  if (page === 'dashboard') {
    return <Dashboard />;
  }

  return <Settings />;
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
