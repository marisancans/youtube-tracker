import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import Settings from './Settings';
import Dashboard from './Dashboard';
import Onboarding from './Onboarding';
import '../styles/globals.css';

type Page = 'settings' | 'map';

function getPageFromHash(): Page {
  return window.location.hash === '#map' ? 'map' : 'settings';
}

function App() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>(getPageFromHash);

  // Listen for hash changes (back/forward navigation)
  useEffect(() => {
    const onHashChange = () => setPage(getPageFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    // Check if onboarding has been completed
    chrome.storage.local.get(['onboardingCompleted', 'settings'], (result) => {
      setShowOnboarding(!result.onboardingCompleted);
      setLoading(false);
    });
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

  if (page === 'map') {
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
