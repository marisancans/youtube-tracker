import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import Settings from './Settings';
import Onboarding from './Onboarding';
import '../styles/globals.css';

function App() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if onboarding has been completed
    chrome.storage.local.get(['onboardingCompleted', 'settings'], (result) => {
      setShowOnboarding(!result.onboardingCompleted);
      setLoading(false);
    });
  }, []);

  const handleOnboardingComplete = async (settings: { goalMode: string; dailyGoalMinutes: number }) => {
    // Save settings
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

    // Notify background
    chrome.runtime.sendMessage({ type: 'SET_GOAL_MODE', data: { mode: settings.goalMode } });

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
