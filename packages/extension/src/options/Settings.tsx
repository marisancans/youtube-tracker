import { useEffect, useState, useCallback } from 'react';
import { mergeLiveStats } from '@/lib/live-stats-merger';
import { Switch } from '@/components/ui/switch';
import {
  Loader2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  CompassRose,
  ShipIcon,
  AnchorIcon,
  WaveDecoration,
  ShipsWheel,
  Lighthouse,
  Spyglass,
  RopeKnot,
} from '@/components/nautical/NauticalIcons';

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

interface DriftWeights {
  timePressure: number;
  contentQuality: number;
  behaviorPattern: number;
  circadian: number;
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
  bedtimeHour: number;
  driftWeights: DriftWeights;
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
  { goalMinutes: number; xpMultiplier: number; icon: string; label: string; rank: string; rankIcon: JSX.Element }
> = {
  casual: { goalMinutes: 60, xpMultiplier: 1.0, icon: '\u2693', label: 'Casual', rank: 'Deckhand', rankIcon: <AnchorIcon size={20} /> },
  focused: { goalMinutes: 45, xpMultiplier: 1.5, icon: '\u2388', label: 'Focused', rank: 'Helmsman', rankIcon: <ShipsWheel size={20} /> },
  disciplined: { goalMinutes: 30, xpMultiplier: 2.0, icon: '\u2694', label: 'Disciplined', rank: 'First Mate', rankIcon: <CompassRose score={75} size={20} /> },
  monk: { goalMinutes: 15, xpMultiplier: 3.0, icon: '\u2605', label: 'Monk', rank: 'Captain', rankIcon: <span className="text-gold text-lg">{'\u2605'}</span> },
  ascetic: { goalMinutes: 5, xpMultiplier: 5.0, icon: '\u2726', label: 'Ascetic', rank: 'Admiral', rankIcon: <span className="text-gold text-lg">{'\u2726'}</span> },
};

const GOAL_MODES: Record<GoalMode, { icon: JSX.Element; label: string; desc: string; nauticalLabel: string }> = {
  music: {
    icon: <WaveDecoration className="text-teal" width={28} />,
    label: 'Music Mode',
    desc: 'Music videos are exempt from tracking',
    nauticalLabel: 'Sea Shanty',
  },
  time_reduction: {
    icon: <CompassRose score={60} size={28} className="text-gold" />,
    label: 'Time Reduction',
    desc: 'Focus on reducing daily watch time',
    nauticalLabel: 'Trade Route',
  },
  strict: {
    icon: <Spyglass size={28} className="text-ink" />,
    label: 'Strict Mode',
    desc: 'Faster drift buildup (1.5x)',
    nauticalLabel: "Privateer's Code",
  },
  cold_turkey: {
    icon: <AnchorIcon size={28} className="text-navy" />,
    label: 'Cold Turkey',
    desc: 'Hard block when over limit',
    nauticalLabel: 'Dry Dock',
  },
};

const DEFAULT_DRIFT_WEIGHTS: DriftWeights = {
  timePressure: 0.40,
  contentQuality: 0.25,
  behaviorPattern: 0.20,
  circadian: 0.15,
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
  bedtimeHour: 23,
  driftWeights: { ...DEFAULT_DRIFT_WEIGHTS },
  devFeatures: { driftEffects: false, frictionOverlay: false, musicDetection: false, nudges: false, syncDebug: false },
};

// ===== Helpers =====

function friendlyFetchError(e: unknown): string {
  const msg = String(e);
  if (msg.includes('Failed to fetch')) return 'Could not connect \u2014 is the server running?';
  if (msg.includes('NetworkError')) return 'Network error \u2014 check your connection';
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

// ===== Sea State Display (was DriftWeather) =====

function SeaStateDisplay({ drift, level }: { drift: number; level: string }) {
  const percentage = Math.round(drift * 100);

  const getSeaConfig = () => {
    if (level === 'critical') {
      return {
        label: 'Critical',
        desc: 'Heavy friction active',
        gradient: 'from-storm-red/30 via-storm-gray to-navy',
        textColor: 'text-parchment',
        accentColor: 'text-parchment-dark',
        waveAnim: 'animate-wave-storm',
        shipScale: 'scale-110',
      };
    }
    if (level === 'high') {
      return {
        label: 'High',
        desc: 'Drifting away from your goals',
        gradient: 'from-storm-gray via-storm-gray/80 to-storm-gray/60',
        textColor: 'text-parchment',
        accentColor: 'text-parchment-dark',
        waveAnim: 'animate-wave-medium',
        shipScale: 'scale-105',
      };
    }
    if (level === 'medium') {
      return {
        label: 'Medium',
        desc: 'Getting distracted',
        gradient: 'from-amber-500/20 via-gold/20 to-parchment-dark/20',
        textColor: 'text-ink',
        accentColor: 'text-ink-light',
        waveAnim: 'animate-wave-medium',
        shipScale: '',
      };
    }
    return {
      label: 'Low',
      desc: 'Staying focused',
      gradient: 'from-teal/30 via-teal-light/20 to-seafoam/10',
      textColor: 'text-ink',
      accentColor: 'text-ink-light',
      waveAnim: 'animate-wave-gentle',
      shipScale: '',
    };
  };

  const sea = getSeaConfig();

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${sea.gradient} p-8 rope-border`}>
      {/* Animated fog/mist overlay */}
      <div className="absolute inset-0 opacity-10 animate-fog-drift">
        <div className="absolute top-4 left-10 w-40 h-16 bg-parchment/40 rounded-full blur-2xl" />
        <div className="absolute top-14 right-16 w-32 h-12 bg-parchment/30 rounded-full blur-xl" />
        <div className="absolute bottom-12 left-1/4 w-48 h-20 bg-parchment/20 rounded-full blur-2xl" />
      </div>

      <div className="relative flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <ShipsWheel size={18} className={sea.accentColor} />
            <span className={`text-sm font-body font-medium uppercase tracking-widest ${sea.accentColor}`}>
              Drift Level
            </span>
          </div>
          <div className={`text-6xl font-display font-bold ${sea.textColor} mb-1 tracking-tight`}>
            {percentage}%
          </div>
          <div className={`text-xl font-display ${sea.textColor}`}>{sea.label}</div>
          <div className={`text-sm font-body ${sea.accentColor} mt-1`}>{sea.desc}</div>
        </div>

        <div className={`${sea.textColor} ${sea.shipScale} transition-transform`}>
          <ShipIcon drift={drift} size={72} className={sea.textColor} />
        </div>
      </div>

      {/* Drift bar */}
      <div className="relative mt-6">
        <div className="h-2.5 bg-ink/15 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-gold-dark via-gold to-gold-dark"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs font-mono tracking-wider">
          <span className={sea.accentColor}>Focused</span>
          <span className={sea.accentColor}>Distracted</span>
        </div>
      </div>

      {/* Wave decorations at bottom */}
      <div className={`absolute bottom-0 left-0 right-0 ${sea.waveAnim}`}>
        <WaveDecoration width={700} className={`${sea.textColor} opacity-20 w-full`} />
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
  const [showWeights, setShowWeights] = useState(false);

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
        const stats = { ...data.dailyStats };
        // Merge live session into today's stats
        const tk = new Date().toISOString().split('T')[0];
        const merged = mergeLiveStats(stats[tk], {
          liveSession: data.liveSession,
          liveTemporal: data.liveTemporal,
          liveSessionUpdatedAt: data.liveSessionUpdatedAt,
        });
        if (merged) stats[tk] = merged;
        setDailyStats(stats);
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

    // React to storage changes instead of one-shot load
    const WATCH_KEYS = new Set(['dailyStats', 'liveSession', 'liveTemporal', 'liveSessionUpdatedAt', 'settings', 'xp', 'lastSyncResult']);
    const onChanged = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (Object.keys(changes).some((k) => WATCH_KEYS.has(k))) {
        fetchData();
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
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

  // ===== Morse code status dots =====
  const syncStatusDots = () => {
    if (!settings.backend.enabled) return <span className="text-parchment-darker font-mono tracking-[0.3em]">- - -</span>;
    if (lastSyncResult && !lastSyncResult.success) return <span className="text-storm-red font-mono tracking-[0.3em]">. . .</span>;
    if (lastSyncResult?.timestamp) return <span className="text-teal font-mono tracking-[0.3em]">- . -</span>;
    return <span className="text-gold font-mono tracking-[0.3em]">. - .</span>;
  };

  // ===== Render =====

  if (loading) {
    return (
      <div className="min-h-screen parchment-texture map-grid flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <ShipsWheel size={48} className="text-gold animate-compass-spin" />
          <span className="font-display text-ink-light text-sm italic">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen parchment-texture map-grid font-body">
      {/* Header */}
      <header className="bg-navy sticky top-0 z-50 shadow-lg">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gold-dark to-gold flex items-center justify-center">
              <ShipsWheel size={22} className="text-navy" />
            </div>
            <div>
              <h1 className="text-lg font-display font-semibold text-parchment">YouTube Detox</h1>
              <p className="text-xs text-parchment-darker font-body italic">Track and reduce your YouTube time</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {authUser ? (
              <div className="flex items-center gap-2 border border-gold/40 rounded-full px-3 py-1.5">
                {authUser.picture && (
                  <img src={authUser.picture} alt="" className="w-7 h-7 rounded-full ring-1 ring-gold/50" />
                )}
                <span className="text-sm text-parchment-dark hidden sm:inline font-body">{authUser.email}</span>
                <button
                  onClick={handleSignOut}
                  className="p-1.5 hover:bg-navy-light rounded-lg text-parchment-darker transition-colors"
                  title="Sign Out"
                >
                  <AnchorIcon size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={handleSignIn}
                disabled={authLoading}
                className="px-3 py-1.5 bg-navy-light hover:bg-gold/20 border border-gold/30 rounded-lg text-sm text-parchment font-body flex items-center gap-2 transition-colors"
              >
                {authLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-gold" />
                ) : (
                  <Spyglass size={16} className="text-gold" />
                )}
                Sign In
              </button>
            )}
            <button
              onClick={fetchData}
              className="p-2 hover:bg-navy-light rounded-lg text-parchment-darker transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-2xl mx-auto px-6">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-5 py-2.5 text-sm font-display font-medium rounded-t-lg transition-all border-b-2 ${
                activeTab === 'dashboard'
                  ? 'bg-parchment text-ink border-gold shadow-sm'
                  : 'bg-navy-light text-parchment-dark border-transparent hover:text-parchment hover:bg-navy-light/80'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => { window.location.hash = '#dashboard'; }}
              className="px-5 py-2.5 text-sm font-display font-medium rounded-t-lg transition-all border-b-2 bg-navy-light text-parchment-dark border-transparent hover:text-parchment hover:bg-navy-light/80 flex items-center gap-2"
            >
              <Spyglass size={14} />
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-5 py-2.5 text-sm font-display font-medium rounded-t-lg transition-all border-b-2 flex items-center gap-2 ${
                activeTab === 'settings'
                  ? 'bg-parchment text-ink border-gold shadow-sm'
                  : 'bg-navy-light text-parchment-dark border-transparent hover:text-parchment hover:bg-navy-light/80'
              }`}
            >
              <ShipsWheel size={14} />
              Settings
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        {activeTab === 'dashboard' ? (
          <div className="space-y-6 animate-parchment-unfurl">
            {/* Sea State Display */}
            {drift && <SeaStateDisplay drift={drift.current} level={drift.level} />}

            {/* Today's Stats */}
            <div className="bg-parchment rounded-2xl p-6 shadow-sm rope-border">
              <h2 className="text-sm font-display font-medium text-ink-light uppercase tracking-widest mb-4">
                Today
              </h2>

              <div className="flex items-end justify-between mb-6">
                <div>
                  <div className="text-4xl font-display font-bold text-ink coordinate-text">
                    {formatMinutes(todayMinutes)}
                  </div>
                  <div className={`text-sm mt-1 font-body ${isOverGoal ? 'text-storm-red' : 'text-teal'}`}>
                    {isOverGoal
                      ? `${formatMinutes(Math.abs(remaining))} over limit`
                      : `${formatMinutes(remaining)} remaining`}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-2xl font-display font-semibold text-ink">{todayStats?.videoCount || 0}</div>
                  <div className="text-sm text-ink-light font-body">videos</div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-3 bg-parchment-darker/50 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isOverGoal
                      ? 'bg-gradient-to-r from-storm-red/80 to-storm-red'
                      : 'bg-gradient-to-r from-gold-dark via-gold to-gold-dark'
                  }`}
                  style={{ width: `${Math.min(100, (todayMinutes / settings.dailyGoalMinutes) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-xs text-ink-light coordinate-text">
                <span>00:00</span>
                <span>{formatMinutes(settings.dailyGoalMinutes)} limit</span>
              </div>
            </div>

            {/* Quick Stats Row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-parchment rounded-xl p-4 shadow-sm rope-border text-center">
                <Lighthouse size={28} beacon className="mx-auto mb-2 text-gold" />
                <div className="text-2xl font-display font-bold text-ink">{streak}</div>
                <div className="text-xs text-ink-light font-body">Day Streak</div>
              </div>

              <div className="bg-parchment rounded-xl p-4 shadow-sm rope-border text-center">
                <CompassRose score={Math.min(level * 10, 100)} size={28} className="mx-auto mb-2 text-gold" />
                <div className="text-2xl font-display font-bold text-ink">{level}</div>
                <div className="text-xs text-ink-light font-body">Level</div>
              </div>

              <div className="bg-parchment rounded-xl p-4 shadow-sm rope-border text-center">
                <ShipIcon drift={0} size={28} className="mx-auto mb-2 text-gold" />
                <div className="text-2xl font-display font-bold text-ink">{weeklyVideos}</div>
                <div className="text-xs text-ink-light font-body">Videos This Week</div>
              </div>
            </div>

            {/* Rope separator */}
            <div className="flex justify-center py-1">
              <RopeKnot className="text-gold-dark" />
            </div>

            {/* Weekly Summary (Collapsible) */}
            <div className="bg-parchment rounded-2xl shadow-sm rope-border overflow-hidden">
              <button
                onClick={() => setShowWeekly(!showWeekly)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-parchment-dark/30 transition-colors"
              >
                <span className="text-sm font-display font-medium text-ink">Weekly Summary</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-ink-light coordinate-text">{formatMinutes(weeklyMinutes)} total</span>
                  {showWeekly ? (
                    <ChevronUp className="w-4 h-4 text-ink-light" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-ink-light" />
                  )}
                </div>
              </button>

              {showWeekly && (
                <div className="px-6 pb-4 border-t border-gold/20">
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
                                isToday
                                  ? 'bg-gradient-to-t from-gold-dark to-gold shadow-[0_0_8px_rgba(212,165,116,0.5)]'
                                  : 'bg-gradient-to-t from-parchment-darker to-parchment-dark'
                              }`}
                              style={{ height: `${Math.max(height, 4)}%` }}
                              title={`${formatMinutes(mins)}`}
                            />
                          </div>
                          <span
                            className={`text-xs font-display ${
                              isToday ? 'text-gold-dark font-bold' : 'text-ink-light'
                            }`}
                          >
                            {dayName}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Current Tier / Rank */}
            <div className="bg-parchment rounded-2xl p-6 shadow-sm rope-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gold-dark to-gold flex items-center justify-center text-navy">
                    {CHALLENGE_TIERS[settings.challengeTier].rankIcon}
                  </div>
                  <div>
                    <div className="font-display font-semibold text-ink text-lg">
                      {CHALLENGE_TIERS[settings.challengeTier].label}
                    </div>
                    <div className="text-sm text-ink-light font-body">
                      {formatMinutes(CHALLENGE_TIERS[settings.challengeTier].goalMinutes)} daily watch limit
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-display font-semibold text-gold-dark">
                    {CHALLENGE_TIERS[settings.challengeTier].xpMultiplier}x XP
                  </div>
                  <div className="text-xs text-ink-light coordinate-text">{xp} total</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Settings Tab - Ship's Orders */
          <div className="space-y-6 animate-parchment-unfurl">
            {/* Voyage Type (Goal Mode) */}
            <div className="bg-parchment rounded-2xl p-6 shadow-sm rope-border">
              <h2 className="font-display text-ink text-lg font-semibold mb-1">Goal Mode</h2>
              <p className="text-sm text-ink-light font-body mb-4">How the extension manages your YouTube time</p>
              <div className="grid grid-cols-1 gap-3">
                {(Object.entries(GOAL_MODES) as [GoalMode, (typeof GOAL_MODES)[GoalMode]][]).map(([mode, config]) => (
                  <button
                    key={mode}
                    onClick={() => setSettings((p) => ({ ...p, goalMode: mode }))}
                    className={`p-4 rounded-xl border-2 text-left transition-all flex items-center gap-4 ${
                      settings.goalMode === mode
                        ? 'border-gold bg-gold/10 shadow-[0_0_12px_rgba(212,165,116,0.2)]'
                        : 'border-parchment-darker/50 hover:border-gold/50 hover:bg-parchment-dark/20'
                    }`}
                  >
                    <div
                      className={`w-12 h-12 flex items-center justify-center rounded-lg ${
                        settings.goalMode === mode ? 'bg-gold/20' : 'bg-parchment-dark/30'
                      }`}
                    >
                      {config.icon}
                    </div>
                    <div>
                      <div className={`font-display font-semibold ${settings.goalMode === mode ? 'text-ink' : 'text-ink-light'}`}>
                        {config.label}
                      </div>
                      <div className="text-sm text-ink-light font-body">{config.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Rope separator */}
            <div className="flex justify-center">
              <WaveDecoration width={300} className="text-gold-dark" />
            </div>

            {/* Crew Rank (Challenge Tier) */}
            <div className="bg-parchment rounded-2xl p-6 shadow-sm rope-border">
              <h2 className="font-display text-ink text-lg font-semibold mb-1">Difficulty Level</h2>
              <p className="text-sm text-ink-light font-body mb-4">Stricter limits earn more XP</p>
              <div className="grid grid-cols-5 gap-2">
                {(Object.entries(CHALLENGE_TIERS) as [ChallengeTier, (typeof CHALLENGE_TIERS)[ChallengeTier]][]).map(
                  ([tier, config]) => (
                    <button
                      key={tier}
                      onClick={() =>
                        setSettings((p) => ({ ...p, challengeTier: tier, dailyGoalMinutes: config.goalMinutes }))
                      }
                      className={`p-3 rounded-xl border-2 text-center transition-all ${
                        settings.challengeTier === tier
                          ? 'border-gold bg-gold/15 shadow-[0_0_16px_rgba(212,165,116,0.3)]'
                          : 'border-parchment-darker/40 hover:border-gold/40 hover:bg-parchment-dark/20'
                      }`}
                    >
                      <div className={`w-8 h-8 mx-auto mb-1.5 rounded-full flex items-center justify-center ${
                        settings.challengeTier === tier ? 'bg-gold/30' : 'bg-parchment-dark/30'
                      }`}>
                        {config.rankIcon}
                      </div>
                      <span
                        className={`text-xs font-display font-medium block ${
                          settings.challengeTier === tier ? 'text-ink' : 'text-ink-light'
                        }`}
                      >
                        {config.label}
                      </span>
                      <span className="text-xs text-ink-light coordinate-text block mt-0.5">
                        {config.goalMinutes}m
                      </span>
                      <span className="text-[10px] text-gold-dark font-mono block">
                        {config.xpMultiplier}x
                      </span>
                    </button>
                  ),
                )}
              </div>
            </div>

            {/* Rope separator */}
            <div className="flex justify-center">
              <WaveDecoration width={300} className="text-gold-dark" />
            </div>

            {/* Bedtime */}
            <div className="bg-parchment rounded-2xl p-6 shadow-sm rope-border">
              <h2 className="font-display text-ink text-lg font-semibold mb-1">Bedtime</h2>
              <p className="text-sm text-ink-light font-body mb-4">
                When should YouTube get harder to use?
              </p>
              <select
                value={settings.bedtimeHour ?? 23}
                onChange={(e) => setSettings((p) => ({ ...p, bedtimeHour: Number(e.target.value) }))}
                className="bg-parchment-dark/30 border border-gold/30 rounded-lg px-4 py-2 font-body text-ink"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{`${i.toString().padStart(2, '0')}:00`}</option>
                ))}
              </select>
              <p className="text-xs text-ink-light mt-2 font-body">
                Wind-down starts 2h before. Full circadian penalty at bedtime.
              </p>
            </div>

            {/* Advanced: Drift Weights (collapsible) */}
            <div className="bg-parchment rounded-2xl shadow-sm rope-border overflow-hidden">
              <button
                onClick={() => setShowWeights(!showWeights)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-parchment-dark/30 transition-colors"
              >
                <div>
                  <span className="font-display text-ink text-lg font-semibold">Advanced: Drift Weights</span>
                  <p className="text-sm text-ink-light font-body mt-0.5">Fine-tune how drift is calculated</p>
                </div>
                {showWeights ? (
                  <ChevronUp className="w-5 h-5 text-ink-light" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-ink-light" />
                )}
              </button>

              {showWeights && (
                <div className="px-6 pb-6 border-t border-gold/20 pt-4 space-y-5">
                  {([
                    { key: 'timePressure' as const, label: 'Time Pressure', desc: 'How much time spent affects drift' },
                    { key: 'contentQuality' as const, label: 'Content Quality', desc: 'Impact of video quality ratings' },
                    { key: 'behaviorPattern' as const, label: 'Behavior Pattern', desc: 'Binge-watching and rapid switching' },
                    { key: 'circadian' as const, label: 'Circadian', desc: 'Late-night usage penalty' },
                  ]).map(({ key, label, desc }) => (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <div>
                          <span className="font-display font-medium text-ink text-sm">{label}</span>
                          <p className="text-xs text-ink-light font-body">{desc}</p>
                        </div>
                        <span className="font-mono text-sm text-ink tabular-nums">
                          {((settings.driftWeights ?? DEFAULT_DRIFT_WEIGHTS)[key] * 100).toFixed(0)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round((settings.driftWeights ?? DEFAULT_DRIFT_WEIGHTS)[key] * 100)}
                        onChange={(e) => {
                          const newVal = Number(e.target.value) / 100;
                          setSettings((prev) => {
                            const oldWeights = prev.driftWeights ?? { ...DEFAULT_DRIFT_WEIGHTS };
                            const oldVal = oldWeights[key];
                            const othersSum = 1.0 - oldVal;
                            const newOthersSum = 1.0 - newVal;

                            const updated = { ...oldWeights };
                            updated[key] = newVal;

                            const otherKeys = (['timePressure', 'contentQuality', 'behaviorPattern', 'circadian'] as const).filter(
                              (k) => k !== key,
                            );

                            if (othersSum > 0.001 && newOthersSum > 0.001) {
                              // Redistribute proportionally
                              for (const ok of otherKeys) {
                                updated[ok] = (oldWeights[ok] / othersSum) * newOthersSum;
                              }
                            } else if (newOthersSum > 0.001) {
                              // Others were all zero, distribute evenly
                              const share = newOthersSum / otherKeys.length;
                              for (const ok of otherKeys) {
                                updated[ok] = share;
                              }
                            } else {
                              // New value is 1.0, zero out others
                              for (const ok of otherKeys) {
                                updated[ok] = 0;
                              }
                            }

                            return { ...prev, driftWeights: updated };
                          });
                        }}
                        className="w-full h-2 rounded-full appearance-none cursor-pointer accent-gold bg-parchment-darker/50
                          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gold [&::-webkit-slider-thumb]:shadow-md
                          [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-gold-dark"
                      />
                    </div>
                  ))}

                  <div className="flex items-center justify-between pt-2 border-t border-gold/15">
                    <span className="text-xs text-ink-light font-mono">
                      Sum: {((settings.driftWeights ?? DEFAULT_DRIFT_WEIGHTS).timePressure +
                        (settings.driftWeights ?? DEFAULT_DRIFT_WEIGHTS).contentQuality +
                        (settings.driftWeights ?? DEFAULT_DRIFT_WEIGHTS).behaviorPattern +
                        (settings.driftWeights ?? DEFAULT_DRIFT_WEIGHTS).circadian).toFixed(2)}
                    </span>
                    <button
                      onClick={() =>
                        setSettings((p) => ({ ...p, driftWeights: { ...DEFAULT_DRIFT_WEIGHTS } }))
                      }
                      className="px-3 py-1.5 text-xs font-display font-medium rounded-lg bg-parchment-dark/50 text-ink hover:bg-parchment-darker/50 transition-colors border border-gold/20"
                    >
                      Reset to defaults
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Rope separator */}
            <div className="flex justify-center">
              <RopeKnot className="text-gold-dark" />
            </div>

            {/* Fog of War Defenses (Friction Effects) */}
            <div className="bg-parchment rounded-2xl p-6 shadow-sm rope-border">
              <h2 className="font-display text-ink text-lg font-semibold mb-1">Friction Effects</h2>
              <p className="text-sm text-ink-light font-body mb-4">Auto-activate as your drift increases</p>
              <div className="space-y-3">
                {[
                  { key: 'thumbnails', label: 'Blur Thumbnails', desc: 'Reduce visual temptation when drifting' },
                  { key: 'sidebar', label: 'Hide Sidebar', desc: 'Remove recommendation sidebar' },
                  { key: 'comments', label: 'Reduce Comments', desc: 'Collapse comment sections' },
                  { key: 'autoplay', label: 'Control Autoplay', desc: 'Delay or disable autoplay' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between py-2.5 border-b border-gold/10 last:border-0">
                    <div>
                      <div className="font-display font-medium text-ink">{label}</div>
                      <div className="text-sm text-ink-light font-body">{desc}</div>
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

            {/* Rope separator */}
            <div className="flex justify-center">
              <WaveDecoration width={300} className="text-gold-dark" />
            </div>

            {/* Engineer's Quarters (Dev Switches) */}
            <div className="bg-navy rounded-2xl p-6 shadow-sm border border-navy-light">
              <h2 className="font-display text-parchment text-lg font-semibold mb-1">Developer Features</h2>
              <p className="text-sm text-parchment-darker font-mono mb-4">Experimental features (all off by default)</p>
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
                  <div key={key} className="flex items-center justify-between py-2.5 border-b border-navy-light/50 last:border-0">
                    <div>
                      <div className="font-mono font-medium text-parchment text-sm">{label}</div>
                      <div className="text-xs text-parchment-darker font-mono">{desc}</div>
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

            {/* Rope separator */}
            <div className="flex justify-center">
              <RopeKnot className="text-gold-dark" />
            </div>

            {/* Ship's Telegraph (Sync & Debug) */}
            <div className="bg-parchment rounded-2xl p-6 shadow-sm rope-border">
              <h2 className="font-display text-ink text-lg font-semibold mb-4 flex items-center gap-3">
                <Spyglass size={20} className="text-gold-dark" />
                Sync & Debug
              </h2>

              {/* Morse-code style status */}
              <div className="mb-3 flex items-center gap-3">
                {syncStatusDots()}
                {!settings.backend.enabled ? (
                  <span className="text-sm text-ink-light font-body">Sync disabled</span>
                ) : lastSyncResult && !lastSyncResult.success ? (
                  <span className="text-sm text-storm-red font-body">
                    Last sync failed at {new Date(lastSyncResult.timestamp).toLocaleTimeString()}
                  </span>
                ) : lastSyncResult?.timestamp ? (
                  <span className="text-sm text-ink font-body">
                    Last synced: {new Date(lastSyncResult.timestamp).toLocaleTimeString()}
                    <span className="text-ink-light">
                      {' '}({Math.round((Date.now() - lastSyncResult.timestamp) / 60000)}m ago)
                    </span>
                  </span>
                ) : (
                  <span className="text-sm text-ink-light font-body">Not synced yet</span>
                )}
              </div>

              {/* Last sync result */}
              {lastSyncResult && (
                <div className={`text-xs mb-4 px-3 py-2 rounded-lg font-mono ${
                  lastSyncResult.success
                    ? 'bg-teal/10 text-teal border border-teal/20'
                    : 'bg-storm-red/10 text-storm-red border border-storm-red/20'
                }`}>
                  {lastSyncResult.success ? (
                    <>
                      Sync successful
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
                  className="px-4 py-2 text-sm font-display font-medium rounded-lg bg-gradient-to-r from-gold-dark to-gold text-navy hover:from-gold hover:to-gold-dark disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
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
                  className="px-4 py-2 text-sm font-display font-medium rounded-lg bg-parchment-dark/50 text-ink hover:bg-parchment-darker/50 disabled:opacity-50 flex items-center gap-2 transition-colors border border-gold/20"
                >
                  {checkingBackend ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Spyglass size={14} />}
                  Server Health
                </button>
              </div>

              {/* Cargo Manifest / Pending Queue (collapsible) */}
              <div className="border-t border-gold/20">
                <button
                  onClick={() => {
                    if (!showPending) {
                      chrome.runtime.sendMessage({ type: 'GET_PENDING_COUNTS' }, (response) => {
                        if (response && !response.error) setPendingCounts(response);
                      });
                    }
                    setShowPending(!showPending);
                  }}
                  className="w-full py-3 flex items-center justify-between text-sm text-ink hover:text-ink-light transition-colors"
                >
                  <span className="font-display font-medium">Pending Queue</span>
                  {showPending ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showPending && (
                  <div className="pb-3 text-xs font-mono text-ink-light">
                    {pendingCounts ? (
                      (() => {
                        const nonZero = Object.entries(pendingCounts).filter(([, v]) => v > 0);
                        return nonZero.length > 0 ? (
                          <div className="space-y-1">
                            {nonZero.map(([k, v]) => (
                              <div key={k}>
                                {k}: <span className="text-ink">{v}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-ink-light italic captains-log">Nothing pending</span>
                        );
                      })()
                    ) : (
                      <span className="text-ink-light">Loading...</span>
                    )}
                  </div>
                )}
              </div>

              {/* Port Report / Backend Details (collapsible) */}
              <div className="border-t border-gold/20">
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
                  className="w-full py-3 flex items-center justify-between text-sm text-ink hover:text-ink-light transition-colors"
                >
                  <span className="font-display font-medium">Server Details</span>
                  {showBackendDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showBackendDetails && (
                  <div className="pb-3 text-xs font-mono text-ink-light space-y-1">
                    {backendHealth ? (
                      backendHealth.error && !backendHealth.status ? (
                        <div>
                          <div className="text-storm-red">Server unreachable</div>
                          <div className="text-ink-light break-all">{backendHealth.url || settings.backend.url}</div>
                          <div className="text-storm-red mt-1">{backendHealth.error}</div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div>
                            status: <span className="text-ink">{backendHealth.status}</span>
                          </div>
                          <div>
                            database: <span className="text-ink">{backendHealth.database}</span>
                          </div>
                          <div>
                            migration: <span className="text-ink">{backendHealth.migration}</span>
                          </div>
                          {backendHealth.userCounts && (
                            <div className="mt-2 pt-2 border-t border-gold/10">
                              <div className="text-ink-light mb-1">Record counts:</div>
                              {Object.entries(backendHealth.userCounts as Record<string, number>).map(([k, v]) => (
                                <div key={k}>
                                  {k}: <span className="text-ink">{v}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    ) : checkingBackend ? (
                      <span className="text-ink-light">Checking...</span>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            {/* Save Button - Chart the Course */}
            <button
              onClick={saveSettings}
              className="w-full py-3.5 bg-gradient-to-r from-gold-dark via-gold to-gold-dark hover:from-gold hover:via-gold-dark hover:to-gold text-navy font-display font-semibold text-base rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-3"
            >
              <CompassRose score={100} size={20} className="text-navy" />
              Save Settings
            </button>
          </div>
        )}
      </main>

      {/* Restore Modal - Message in a Bottle */}
      {showRestoreModal && restoreData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-navy/70">
          <div className="bg-parchment rounded-2xl shadow-xl max-w-md w-full mx-4 p-6 rope-border animate-parchment-unfurl">
            {/* Wax seal */}
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-storm-red flex items-center justify-center shadow-lg">
                <AnchorIcon size={24} className="text-parchment" />
              </div>
            </div>

            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-display font-semibold text-ink">Restore Data</h3>
              <button
                onClick={() => { setShowRestoreModal(false); setRestoreData(null); }}
                className="p-1 hover:bg-parchment-dark rounded-lg text-ink-light transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-ink-light font-body mb-4 captains-log">
              Previous data was found on the server. Would you like to restore it?
            </p>

            <div className="bg-parchment-dark/40 rounded-lg p-3 mb-4 text-xs font-mono text-ink-light space-y-1 border border-gold/20">
              {Object.entries(restoreData.existingCounts)
                .filter(([, v]) => v > 0)
                .map(([k, v]) => (
                  <div key={k}>{k}: <span className="text-ink">{v}</span></div>
                ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleRestore}
                disabled={resolving}
                className="flex-1 py-2.5 bg-gradient-to-r from-gold-dark to-gold text-navy font-display font-semibold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 hover:shadow-md"
              >
                {resolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <AnchorIcon size={16} />}
                Restore Data
              </button>
              <button
                onClick={() => { setShowRestoreModal(false); setRestoreData(null); }}
                disabled={resolving}
                className="flex-1 py-2.5 bg-transparent border-2 border-gold/40 text-ink font-display font-medium rounded-xl transition-all disabled:opacity-50 hover:border-gold hover:bg-parchment-dark/20"
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
