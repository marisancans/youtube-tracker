import { useEffect, useState, useCallback } from 'react';
import { Switch } from '@/components/ui/switch';
import {
  Settings as SettingsIcon,
  Loader2,
  LogOut,
  Wind,
  Clock,
  Video,
  Flame,
  Trophy,
  Music,
  Lock,
  Snowflake,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudRain,
  CloudLightning,
  Sun,
  Activity,
  User,
  Download,
  X,
} from 'lucide-react';

// ===== Types =====

interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture: string;
}

type GoalMode = 'music' | 'time_reduction' | 'strict' | 'cold_turkey';
type ChallengeTier = 'casual' | 'focused' | 'disciplined' | 'monk' | 'ascetic';

interface DailyStats {
  date: string;
  totalSeconds: number;
  videoCount: number;
  productiveVideos: number;
  unproductiveVideos: number;
  neutralVideos: number;
}

interface DriftData {
  current: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  history: Array<{ timestamp: number; value: number }>;
}

interface SettingsState {
  trackingEnabled: boolean;
  dailyGoalMinutes: number;
  productivityPrompts: boolean;
  promptChance: number;
  weeklyReports: boolean;
  backend: {
    enabled: boolean;
    url: string;
    userId: string;
  };
  goalMode: GoalMode;
  challengeTier: ChallengeTier;
  frictionEnabled: {
    thumbnails: boolean;
    sidebar: boolean;
    comments: boolean;
    autoplay: boolean;
  };
  whitelistedChannels: string[];
  devFeatures: {
    driftEffects: boolean;
    frictionOverlay: boolean;
    musicDetection: boolean;
    nudges: boolean;
    syncDebug: boolean;
  };
}

// ===== Constants =====

const CHALLENGE_TIERS: Record<
  ChallengeTier,
  { goalMinutes: number; xpMultiplier: number; icon: string; label: string }
> = {
  casual: { goalMinutes: 60, xpMultiplier: 1.0, icon: '🌱', label: 'Casual' },
  focused: { goalMinutes: 45, xpMultiplier: 1.5, icon: '🎯', label: 'Focused' },
  disciplined: { goalMinutes: 30, xpMultiplier: 2.0, icon: '⚡', label: 'Disciplined' },
  monk: { goalMinutes: 15, xpMultiplier: 3.0, icon: '🔥', label: 'Monk' },
  ascetic: { goalMinutes: 5, xpMultiplier: 5.0, icon: '💎', label: 'Ascetic' },
};

const GOAL_MODES: Record<GoalMode, { icon: JSX.Element; label: string; desc: string }> = {
  music: { icon: <Music className="w-5 h-5" />, label: 'Music Mode', desc: 'Music videos are exempt from tracking' },
  time_reduction: {
    icon: <Clock className="w-5 h-5" />,
    label: 'Time Reduction',
    desc: 'Focus on reducing daily watch time',
  },
  strict: { icon: <Lock className="w-5 h-5" />, label: 'Strict Mode', desc: 'Faster drift buildup (1.5x)' },
  cold_turkey: { icon: <Snowflake className="w-5 h-5" />, label: 'Cold Turkey', desc: 'Hard block when over limit' },
};

const defaultSettings: SettingsState = {
  trackingEnabled: true,
  dailyGoalMinutes: 60,
  productivityPrompts: true,
  promptChance: 30,
  weeklyReports: true,
  backend: { enabled: false, url: 'https://linuxx.tailf96d3c.ts.net', userId: '' },
  goalMode: 'time_reduction',
  challengeTier: 'casual',
  frictionEnabled: { thumbnails: true, sidebar: true, comments: true, autoplay: true },
  whitelistedChannels: [],
  devFeatures: { driftEffects: false, frictionOverlay: false, musicDetection: false, nudges: false, syncDebug: false },
};

// ===== Helpers =====

function friendlyFetchError(e: unknown): string {
  const msg = String(e);
  if (msg.includes('Failed to fetch')) return 'Could not connect — is the server running?';
  if (msg.includes('NetworkError')) return 'Network error — check your connection';
  return msg;
}

function formatMinutes(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
}

// ===== Drift Weather Component =====

function DriftWeather({ drift, level }: { drift: number; level: string }) {
  const percentage = Math.round(drift * 100);

  // Weather based on drift level
  const getWeatherConfig = () => {
    if (level === 'critical') {
      return {
        icon: <CloudLightning className="w-16 h-16" />,
        label: 'Storm',
        desc: 'Heavy friction active',
        gradient: 'from-slate-800 via-slate-700 to-slate-600',
        textColor: 'text-slate-200',
        accentColor: 'text-amber-400',
      };
    }
    if (level === 'high') {
      return {
        icon: <CloudRain className="w-16 h-16" />,
        label: 'Rainy',
        desc: 'Drifting from focus',
        gradient: 'from-slate-600 via-slate-500 to-slate-400',
        textColor: 'text-slate-100',
        accentColor: 'text-slate-300',
      };
    }
    if (level === 'medium') {
      return {
        icon: <Cloud className="w-16 h-16" />,
        label: 'Cloudy',
        desc: 'Some distraction',
        gradient: 'from-slate-400 via-slate-300 to-blue-200',
        textColor: 'text-slate-700',
        accentColor: 'text-slate-500',
      };
    }
    return {
      icon: <Sun className="w-16 h-16" />,
      label: 'Clear',
      desc: 'Focused and calm',
      gradient: 'from-sky-400 via-blue-300 to-cyan-200',
      textColor: 'text-sky-900',
      accentColor: 'text-sky-700',
    };
  };

  const weather = getWeatherConfig();

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${weather.gradient} p-8`}>
      {/* Animated clouds/wind effect */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-4 left-10 w-32 h-16 bg-white/30 rounded-full blur-xl animate-pulse" />
        <div
          className="absolute top-12 right-20 w-24 h-12 bg-white/20 rounded-full blur-lg animate-pulse"
          style={{ animationDelay: '1s' }}
        />
        <div
          className="absolute bottom-8 left-1/3 w-40 h-20 bg-white/25 rounded-full blur-xl animate-pulse"
          style={{ animationDelay: '0.5s' }}
        />
      </div>

      <div className="relative flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Wind className={`w-5 h-5 ${weather.accentColor}`} />
            <span className={`text-sm font-medium uppercase tracking-wide ${weather.accentColor}`}>Drift Level</span>
          </div>
          <div className={`text-6xl font-bold ${weather.textColor} mb-1`}>{percentage}%</div>
          <div className={`text-xl font-medium ${weather.textColor}`}>{weather.label}</div>
          <div className={`text-sm ${weather.accentColor} mt-1`}>{weather.desc}</div>
        </div>

        <div className={weather.textColor}>{weather.icon}</div>
      </div>

      {/* Drift bar */}
      <div className="relative mt-6">
        <div className="h-2 bg-black/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-white/80 rounded-full transition-all duration-700"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs font-medium">
          <span className={weather.accentColor}>Focused</span>
          <span className={weather.accentColor}>Drifting</span>
        </div>
      </div>
    </div>
  );
}

// ===== Main Component =====

export default function Settings() {
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [dailyStats, setDailyStats] = useState<Record<string, DailyStats>>({});
  const [drift, setDrift] = useState<DriftData | null>(null);
  const [streak, setStreak] = useState(0);
  const [xp, setXp] = useState(0);
  const [authUser, setAuthUser] = useState<GoogleUser | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings'>('dashboard');
  const [showWeekly, setShowWeekly] = useState(false);

  const fetchBackendHealth = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (settings.backend.userId) headers['X-User-Id'] = settings.backend.userId;
      const stored = await chrome.storage.local.get('authState');
      if (stored.authState?.token) headers['Authorization'] = `Bearer ${stored.authState.token}`;
      const res = await fetch(`${settings.backend.url}/debug/health`, { headers });
      return await res.json();
    } catch (e) {
      return { error: friendlyFetchError(e), url: settings.backend.url };
    }
  }, [settings.backend.url, settings.backend.userId]);

  // Sync & Debug state
  const [lastSyncResult, setLastSyncResult] = useState<{
    success: boolean;
    syncedCounts?: Record<string, number>;
    error?: string;
    timestamp: number;
  } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pendingCounts, setPendingCounts] = useState<Record<string, number> | null>(null);
  const [backendHealth, setBackendHealth] = useState<any>(null);
  const [showPending, setShowPending] = useState(false);
  const [showBackendDetails, setShowBackendDetails] = useState(false);
  const [checkingBackend, setCheckingBackend] = useState(false);

  // Restore modal state
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreData, setRestoreData] = useState<{ currentDeviceId: string; googleId: string; existingCounts: Record<string, number> } | null>(null);
  const [resolving, setResolving] = useState(false);

  // ===== Fetch Data =====

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await chrome.storage.local.get(null);

      if (data.settings) {
        setSettings({ ...defaultSettings, ...data.settings });
      }
      if (data.dailyStats) {
        setDailyStats(data.dailyStats);
      }
      if (data.xp) setXp(data.xp);

      chrome.runtime.sendMessage({ type: 'GET_STREAK' }, (response) => {
        if (response?.streak !== undefined) setStreak(response.streak);
      });

      chrome.runtime.sendMessage({ type: 'GET_DRIFT' }, (response) => {
        if (response && typeof response.drift === 'number') {
          setDrift({
            current: response.drift,
            level: response.level,
            history: response.history || [],
          });
        }
      });

      chrome.runtime.sendMessage({ type: 'AUTH_GET_STATE' }, (response) => {
        if (response?.user) setAuthUser(response.user);
      });

      // Sync & Debug data
      chrome.storage.local.get(['lastSyncResult'], (data) => {
        if (data.lastSyncResult) setLastSyncResult(data.lastSyncResult);
      });
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ===== Computed Data =====

  const last7Days = (() => {
    const days: DailyStats[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const dayData = dailyStats[key];
      days.push({
        date: key,
        totalSeconds: dayData?.totalSeconds || 0,
        videoCount: dayData?.videoCount || 0,
        productiveVideos: dayData?.productiveVideos || 0,
        unproductiveVideos: dayData?.unproductiveVideos || 0,
        neutralVideos: dayData?.neutralVideos || 0,
      });
    }
    return days;
  })();

  const todayKey = new Date().toISOString().split('T')[0];
  const todayStats = dailyStats[todayKey];
  const todayMinutes = Math.round((todayStats?.totalSeconds || 0) / 60);
  const isOverGoal = todayMinutes > settings.dailyGoalMinutes;
  const remaining = settings.dailyGoalMinutes - todayMinutes;

  const weeklyMinutes = last7Days.reduce((sum, d) => sum + Math.round(d.totalSeconds / 60), 0);
  const weeklyVideos = last7Days.reduce((sum, d) => sum + d.videoCount, 0);

  const level = Math.floor(xp / 100) + 1;

  // ===== Actions =====

  const saveSettings = async () => {
    await chrome.storage.local.set({ settings });
    chrome.runtime.sendMessage({ type: 'SET_GOAL_MODE', data: { mode: settings.goalMode } });
    chrome.runtime.sendMessage({ type: 'SET_CHALLENGE_TIER', data: { tier: settings.challengeTier } });
  };

  const handleSignIn = async () => {
    setAuthLoading(true);
    chrome.runtime.sendMessage({ type: 'AUTH_SIGN_IN' }, async (response) => {
      setAuthLoading(false);
      if (response?.success && response.user) {
        setAuthUser(response.user);
        setSettings((prev) => ({
          ...prev,
          backend: { ...prev.backend, userId: response.user.id, enabled: true },
        }));

        // Check if server already has data (reinstall)
        if (response.hasExistingData) {
          setRestoreData({
            currentDeviceId: response.user.id,
            googleId: response.user.id,
            existingCounts: response.existingCounts || {},
          });
          setShowRestoreModal(true);
        }
      }
    });
  };

  const handleRestore = () => {
    setResolving(true);
    chrome.runtime.sendMessage({ type: 'RESTORE_DATA' }, (response) => {
      setResolving(false);
      setShowRestoreModal(false);
      setRestoreData(null);
      if (response?.success) {
        fetchData();
      }
    });
  };

  const handleSignOut = async () => {
    setAuthLoading(true);
    chrome.runtime.sendMessage({ type: 'AUTH_SIGN_OUT' }, (response) => {
      setAuthLoading(false);
      if (response?.success) {
        setAuthUser(null);
        setSettings((prev) => ({
          ...prev,
          backend: { ...prev.backend, userId: '', enabled: false },
        }));
      }
    });
  };

  // ===== Render =====

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center">
              <Wind className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">YouTube Detox</h1>
              <p className="text-xs text-slate-500">Stay focused, stay calm</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {authUser ? (
              <div className="flex items-center gap-2">
                {authUser.picture && <img src={authUser.picture} alt="" className="w-8 h-8 rounded-full" />}
                <span className="text-sm text-slate-600 hidden sm:inline">{authUser.email}</span>
                <button onClick={handleSignOut} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500" title="Sign Out">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleSignIn}
                disabled={authLoading}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm text-slate-700 flex items-center gap-2"
              >
                {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />}
                Sign In
              </button>
            )}
            <button onClick={fetchData} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-2xl mx-auto px-6">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-slate-50 text-slate-900 border-t border-x border-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'settings'
                  ? 'bg-slate-50 text-slate-900 border-t border-x border-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <SettingsIcon className="w-4 h-4 inline mr-1" />
              Settings
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        {activeTab === 'dashboard' ? (
          <div className="space-y-6">
            {/* Drift Weather Card - Main Focus */}
            {drift && <DriftWeather drift={drift.current} level={drift.level} />}

            {/* Today's Stats */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-4">Today</h2>

              <div className="flex items-end justify-between mb-6">
                <div>
                  <div className="text-4xl font-bold text-slate-900">{formatMinutes(todayMinutes)}</div>
                  <div className={`text-sm mt-1 ${isOverGoal ? 'text-red-500' : 'text-emerald-600'}`}>
                    {isOverGoal
                      ? `${formatMinutes(Math.abs(remaining))} over goal`
                      : `${formatMinutes(remaining)} remaining`}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-2xl font-semibold text-slate-700">{todayStats?.videoCount || 0}</div>
                  <div className="text-sm text-slate-500">videos</div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isOverGoal ? 'bg-red-400' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.min(100, (todayMinutes / settings.dailyGoalMinutes) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-xs text-slate-400">
                <span>0</span>
                <span>{formatMinutes(settings.dailyGoalMinutes)} goal</span>
              </div>
            </div>

            {/* Quick Stats Row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 text-center">
                <Flame className="w-6 h-6 mx-auto mb-2 text-orange-400" />
                <div className="text-2xl font-bold text-slate-900">{streak}</div>
                <div className="text-xs text-slate-500">Day Streak</div>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 text-center">
                <Trophy className="w-6 h-6 mx-auto mb-2 text-amber-400" />
                <div className="text-2xl font-bold text-slate-900">{level}</div>
                <div className="text-xs text-slate-500">Level</div>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 text-center">
                <Video className="w-6 h-6 mx-auto mb-2 text-blue-400" />
                <div className="text-2xl font-bold text-slate-900">{weeklyVideos}</div>
                <div className="text-xs text-slate-500">This Week</div>
              </div>
            </div>

            {/* Weekly Summary (Collapsible) */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <button
                onClick={() => setShowWeekly(!showWeekly)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <span className="text-sm font-medium text-slate-700">Weekly Summary</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-500">{formatMinutes(weeklyMinutes)} total</span>
                  {showWeekly ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </button>

              {showWeekly && (
                <div className="px-6 pb-4 border-t border-slate-100">
                  <div className="flex items-end justify-between h-32 pt-4 gap-2">
                    {last7Days.map((day) => {
                      const mins = Math.round(day.totalSeconds / 60);
                      const maxMins = Math.max(...last7Days.map((d) => Math.round(d.totalSeconds / 60)), 1);
                      const height = (mins / maxMins) * 100;
                      const dayName = ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(day.date).getDay()];
                      const isToday = day.date === todayKey;

                      return (
                        <div key={day.date} className="flex-1 flex flex-col items-center gap-2">
                          <div className="w-full flex items-end justify-center h-20">
                            <div
                              className={`w-full max-w-[32px] rounded-t transition-all ${
                                isToday ? 'bg-blue-400' : 'bg-slate-200'
                              }`}
                              style={{ height: `${Math.max(height, 4)}%` }}
                              title={`${formatMinutes(mins)}`}
                            />
                          </div>
                          <span className={`text-xs ${isToday ? 'text-blue-500 font-medium' : 'text-slate-400'}`}>
                            {dayName}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Current Tier */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-3xl">{CHALLENGE_TIERS[settings.challengeTier].icon}</span>
                  <div>
                    <div className="font-semibold text-slate-900">
                      {CHALLENGE_TIERS[settings.challengeTier].label} Mode
                    </div>
                    <div className="text-sm text-slate-500">
                      {formatMinutes(CHALLENGE_TIERS[settings.challengeTier].goalMinutes)} daily limit
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-amber-500">
                    {CHALLENGE_TIERS[settings.challengeTier].xpMultiplier}x XP
                  </div>
                  <div className="text-xs text-slate-500">{xp} total</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Settings Tab */
          <div className="space-y-6">
            {/* Goal Mode */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-4">Goal Mode</h2>
              <div className="grid grid-cols-1 gap-3">
                {(Object.entries(GOAL_MODES) as [GoalMode, (typeof GOAL_MODES)[GoalMode]][]).map(([mode, config]) => (
                  <button
                    key={mode}
                    onClick={() => setSettings((p) => ({ ...p, goalMode: mode }))}
                    className={`p-4 rounded-xl border text-left transition-all flex items-center gap-4 ${
                      settings.goalMode === mode
                        ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`p-2 rounded-lg ${
                        settings.goalMode === mode ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {config.icon}
                    </div>
                    <div>
                      <div className={`font-medium ${settings.goalMode === mode ? 'text-blue-900' : 'text-slate-700'}`}>
                        {config.label}
                      </div>
                      <div className="text-sm text-slate-500">{config.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Challenge Tier */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-4">Challenge Tier</h2>
              <div className="grid grid-cols-5 gap-2">
                {(Object.entries(CHALLENGE_TIERS) as [ChallengeTier, (typeof CHALLENGE_TIERS)[ChallengeTier]][]).map(
                  ([tier, config]) => (
                    <button
                      key={tier}
                      onClick={() =>
                        setSettings((p) => ({ ...p, challengeTier: tier, dailyGoalMinutes: config.goalMinutes }))
                      }
                      className={`p-3 rounded-xl border text-center transition-all ${
                        settings.challengeTier === tier
                          ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-200'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-2xl block mb-1">{config.icon}</span>
                      <span
                        className={`text-xs font-medium block ${
                          settings.challengeTier === tier ? 'text-amber-700' : 'text-slate-600'
                        }`}
                      >
                        {config.label}
                      </span>
                      <span className="text-xs text-slate-400 block">{config.goalMinutes}m</span>
                    </button>
                  ),
                )}
              </div>
            </div>

            {/* Friction Effects */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-1">Friction Effects</h2>
              <p className="text-sm text-slate-400 mb-4">These activate as drift increases</p>
              <div className="space-y-3">
                {[
                  { key: 'thumbnails', label: 'Blur thumbnails', desc: 'Reduce visual temptation' },
                  { key: 'sidebar', label: 'Hide sidebar', desc: 'Remove recommendations' },
                  { key: 'comments', label: 'Reduce comments', desc: 'Less social distraction' },
                  { key: 'autoplay', label: 'Control autoplay', desc: 'Delay auto-play' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between py-2">
                    <div>
                      <div className="font-medium text-slate-700">{label}</div>
                      <div className="text-sm text-slate-400">{desc}</div>
                    </div>
                    <Switch
                      checked={(settings.frictionEnabled as any)[key]}
                      onCheckedChange={(v) =>
                        setSettings((p) => ({
                          ...p,
                          frictionEnabled: { ...p.frictionEnabled, [key]: v },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Dev Switches */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-1">Dev Switches</h2>
              <p className="text-sm text-slate-400 mb-4">Toggle extension features on/off (all off by default)</p>
              <div className="space-y-3">
                {[
                  {
                    key: 'driftEffects',
                    label: 'Drift CSS Effects',
                    desc: 'Blur thumbnails, hide sidebar/comments based on drift',
                  },
                  { key: 'frictionOverlay', label: 'Friction Overlay', desc: 'Drift rating popup over video player' },
                  {
                    key: 'musicDetection',
                    label: 'Music Detection',
                    desc: 'Detect music videos and exempt from drift',
                  },
                  { key: 'nudges', label: 'Nudges', desc: 'Time warnings, break reminders, bedtime alerts' },
                  { key: 'syncDebug', label: 'Sync Debug', desc: 'Show sync debug panel in widget overlay' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between py-2">
                    <div>
                      <div className="font-medium text-slate-700">{label}</div>
                      <div className="text-sm text-slate-400">{desc}</div>
                    </div>
                    <Switch
                      checked={(settings.devFeatures as any)[key]}
                      onCheckedChange={(v) =>
                        setSettings((p) => ({
                          ...p,
                          devFeatures: { ...p.devFeatures, [key]: v },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Sync & Debug */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Sync & Debug
              </h2>

              {/* Status line */}
              <div className="mb-3">
                {!settings.backend.enabled ? (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
                    Sync disabled
                  </div>
                ) : lastSyncResult && !lastSyncResult.success ? (
                  <div className="flex items-start gap-2 text-sm text-red-600">
                    <span className="w-2 h-2 rounded-full bg-red-500 inline-block mt-1.5 shrink-0" />
                    <span>
                      Last sync failed at {new Date(lastSyncResult.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ) : lastSyncResult?.timestamp ? (
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    <span>
                      Last synced: {new Date(lastSyncResult.timestamp).toLocaleTimeString()}
                      <span className="text-slate-400">
                        {' '}({Math.round((Date.now() - lastSyncResult.timestamp) / 60000)}m ago)
                      </span>
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
                    Never synced
                  </div>
                )}
              </div>

              {/* Last sync result */}
              {lastSyncResult && (
                <div className={`text-xs mb-4 px-3 py-2 rounded-lg ${lastSyncResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {lastSyncResult.success ? (
                    <>
                      OK
                      {lastSyncResult.syncedCounts && (
                        <span>
                          {' \u2014 '}
                          {Object.entries(lastSyncResult.syncedCounts)
                            .filter(([, v]) => v > 0)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(', ') || 'nothing new'}
                        </span>
                      )}
                    </>
                  ) : (
                    <span>{lastSyncResult.error}</span>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={async () => {
                    setSyncing(true);
                    chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, () => {
                      setTimeout(() => {
                        chrome.storage.local.get(['lastSyncResult'], (data) => {
                          if (data.lastSyncResult) setLastSyncResult(data.lastSyncResult);
                          setSyncing(false);
                        });
                      }, 500);
                    });
                  }}
                  disabled={syncing || !settings.backend.enabled}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Sync Now
                </button>
                <button
                  onClick={async () => {
                    setCheckingBackend(true);
                    const data = await fetchBackendHealth();
                    setBackendHealth(data);
                    setCheckingBackend(false);
                  }}
                  disabled={checkingBackend}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 flex items-center gap-2"
                >
                  {checkingBackend ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                  Check Backend
                </button>
              </div>

              {/* Pending Queue (collapsible) */}
              <div className="border-t border-slate-100">
                <button
                  onClick={() => {
                    if (!showPending) {
                      chrome.runtime.sendMessage({ type: 'GET_PENDING_COUNTS' }, (response) => {
                        if (response && !response.error) setPendingCounts(response);
                      });
                    }
                    setShowPending(!showPending);
                  }}
                  className="w-full py-3 flex items-center justify-between text-sm text-slate-600 hover:text-slate-800"
                >
                  <span className="font-medium">Pending Queue</span>
                  {showPending ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showPending && (
                  <div className="pb-3 text-xs font-mono text-slate-500">
                    {pendingCounts ? (
                      (() => {
                        const nonZero = Object.entries(pendingCounts).filter(([, v]) => v > 0);
                        return nonZero.length > 0 ? (
                          <div className="space-y-1">
                            {nonZero.map(([k, v]) => (
                              <div key={k}>
                                {k}: <span className="text-slate-700">{v}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">empty</span>
                        );
                      })()
                    ) : (
                      <span className="text-slate-400">Loading...</span>
                    )}
                  </div>
                )}
              </div>

              {/* Backend Details (collapsible) */}
              <div className="border-t border-slate-100">
                <button
                  onClick={() => {
                    if (!showBackendDetails && !backendHealth) {
                      setCheckingBackend(true);
                      fetchBackendHealth()
                        .then((data) => setBackendHealth(data))
                        .finally(() => setCheckingBackend(false));
                    }
                    setShowBackendDetails(!showBackendDetails);
                  }}
                  className="w-full py-3 flex items-center justify-between text-sm text-slate-600 hover:text-slate-800"
                >
                  <span className="font-medium">Backend Details</span>
                  {showBackendDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showBackendDetails && (
                  <div className="pb-3 text-xs font-mono text-slate-500 space-y-1">
                    {backendHealth ? (
                      backendHealth.error && !backendHealth.status ? (
                        <div>
                          <div className="text-red-600">Backend unreachable</div>
                          <div className="text-slate-400 break-all">{backendHealth.url || settings.backend.url}</div>
                          <div className="text-red-500 mt-1">{backendHealth.error}</div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div>
                            status: <span className="text-slate-700">{backendHealth.status}</span>
                          </div>
                          <div>
                            database: <span className="text-slate-700">{backendHealth.database}</span>
                          </div>
                          <div>
                            migration: <span className="text-slate-700">{backendHealth.migration}</span>
                          </div>
                          {backendHealth.userCounts && (
                            <div className="mt-2 pt-2 border-t border-slate-100">
                              <div className="text-slate-400 mb-1">Row counts:</div>
                              {Object.entries(backendHealth.userCounts as Record<string, number>).map(([k, v]) => (
                                <div key={k}>
                                  {k}: <span className="text-slate-700">{v}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    ) : checkingBackend ? (
                      <span className="text-slate-400">Loading...</span>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            {/* Save Button */}
            <button
              onClick={saveSettings}
              className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl transition-colors"
            >
              Save Settings
            </button>
          </div>
        )}
      </main>

      {/* Restore Modal */}
      {showRestoreModal && restoreData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Existing Data Found</h3>
              <button
                onClick={() => { setShowRestoreModal(false); setRestoreData(null); }}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              Your Google account has data from a previous install. Would you like to restore it?
            </p>

            <div className="bg-slate-50 rounded-lg p-3 mb-4 text-xs font-mono text-slate-600 space-y-1">
              {Object.entries(restoreData.existingCounts)
                .filter(([, v]) => v > 0)
                .map(([k, v]) => (
                  <div key={k}>{k}: <span className="text-slate-800">{v}</span></div>
                ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleRestore}
                disabled={resolving}
                className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {resolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Restore Data
              </button>
              <button
                onClick={() => { setShowRestoreModal(false); setRestoreData(null); }}
                disabled={resolving}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                Start Fresh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
