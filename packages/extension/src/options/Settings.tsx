import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Line,
} from 'recharts';
import {
  Settings as SettingsIcon,
  Loader2,
  LogOut,
  User,
  Waves,
  Eye,
  MessageSquare,
  Sidebar,
  Play,
  Video,
  Clock,
  TrendingUp,
  TrendingDown,
  Flame,
  Trophy,
  Calendar,
  Tv,
  Zap,
  Music,
  Lock,
  Snowflake,
  RefreshCw,
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

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  xpReward: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
}

interface DailyStats {
  date: string;
  totalSeconds: number;
  videoCount: number;
  productiveVideos: number;
  unproductiveVideos: number;
  neutralVideos: number;
  sessionCount: number;
  hourlySeconds: Record<string, number>;
}

interface ChannelStat {
  channel: string;
  minutes: number;
  videoCount: number;
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
}

// ===== Constants =====

const CHALLENGE_TIERS: Record<ChallengeTier, { goalMinutes: number; xpMultiplier: number; icon: string; label: string }> = {
  casual: { goalMinutes: 60, xpMultiplier: 1.0, icon: '🌱', label: 'Casual' },
  focused: { goalMinutes: 45, xpMultiplier: 1.5, icon: '🎯', label: 'Focused' },
  disciplined: { goalMinutes: 30, xpMultiplier: 2.0, icon: '⚡', label: 'Disciplined' },
  monk: { goalMinutes: 15, xpMultiplier: 3.0, icon: '🔥', label: 'Monk' },
  ascetic: { goalMinutes: 5, xpMultiplier: 5.0, icon: '💎', label: 'Ascetic' },
};

const GOAL_MODES: Record<GoalMode, { icon: JSX.Element; label: string; desc: string }> = {
  music: { icon: <Music className="w-4 h-4" />, label: 'Music', desc: 'Music exempt' },
  time_reduction: { icon: <Clock className="w-4 h-4" />, label: 'Time', desc: 'Reduce time' },
  strict: { icon: <Lock className="w-4 h-4" />, label: 'Strict', desc: '1.5x drift' },
  cold_turkey: { icon: <Snowflake className="w-4 h-4" />, label: 'Block', desc: 'Hard limit' },
};

const COLORS = {
  productive: '#22c55e',
  neutral: '#fbbf24',
  unproductive: '#ef4444',
  primary: '#3b82f6',
  purple: '#a855f7',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const defaultSettings: SettingsState = {
  trackingEnabled: true,
  dailyGoalMinutes: 60,
  productivityPrompts: true,
  promptChance: 30,
  weeklyReports: true,
  backend: { enabled: false, url: 'http://localhost:8000', userId: '' },
  goalMode: 'time_reduction',
  challengeTier: 'casual',
  frictionEnabled: { thumbnails: true, sidebar: true, comments: true, autoplay: true },
  whitelistedChannels: [],
};

// ===== Helpers =====

function formatMinutes(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
}

function formatHour(hour: number): string {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

// ===== Main Component =====

export default function Settings() {
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [dailyStats, setDailyStats] = useState<Record<string, DailyStats>>({});
  const [drift, setDrift] = useState<DriftData | null>(null);
  const [streak, setStreak] = useState(0);
  const [xp, setXp] = useState(0);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [channels, setChannels] = useState<ChannelStat[]>([]);
  const [authUser, setAuthUser] = useState<GoogleUser | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ===== Fetch Data =====

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Get all data from storage
      const data = await chrome.storage.local.get(null);
      
      if (data.settings) {
        setSettings({ ...defaultSettings, ...data.settings });
      }
      if (data.dailyStats) {
        setDailyStats(data.dailyStats);
      }
      if (data.xp) setXp(data.xp);

      // Get streak
      chrome.runtime.sendMessage({ type: 'GET_STREAK' }, (response) => {
        if (response?.streak !== undefined) setStreak(response.streak);
      });

      // Get drift
      chrome.runtime.sendMessage({ type: 'GET_DRIFT' }, (response) => {
        if (response && typeof response.drift === 'number') {
          setDrift({
            current: response.drift,
            level: response.level,
            history: response.history || [],
          });
        }
      });

      // Get achievements
      chrome.runtime.sendMessage({ type: 'GET_ACHIEVEMENTS' }, (response) => {
        if (response?.unlocked) setAchievements(response.unlocked);
      });

      // Get auth state
      chrome.runtime.sendMessage({ type: 'AUTH_GET_STATE' }, (response) => {
        if (response?.user) setAuthUser(response.user);
      });

      // Build channel stats from video sessions
      const videoSessions = data.videoSessions || [];
      const channelMap = new Map<string, { videos: number; seconds: number }>();
      videoSessions.forEach((v: any) => {
        if (v.channel) {
          const existing = channelMap.get(v.channel) || { videos: 0, seconds: 0 };
          channelMap.set(v.channel, {
            videos: existing.videos + 1,
            seconds: existing.seconds + (v.watchedSeconds || 0),
          });
        }
      });
      const channelList = Array.from(channelMap.entries())
        .map(([channel, data]) => ({
          channel,
          videoCount: data.videos,
          minutes: Math.round(data.seconds / 60),
        }))
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 10);
      setChannels(channelList);

      setLastUpdated(new Date());
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

  // Last 7 days data
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
        sessionCount: dayData?.sessionCount || 0,
        hourlySeconds: dayData?.hourlySeconds || {},
      });
    }
    return days;
  })();

  // Last 30 days data
  const last30Days = (() => {
    const days: { date: string; minutes: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const dayData = dailyStats[key];
      days.push({
        date: key,
        minutes: Math.round((dayData?.totalSeconds || 0) / 60),
      });
    }
    return days;
  })();

  const todayKey = new Date().toISOString().split('T')[0];
  const todayStats = dailyStats[todayKey];
  const todayMinutes = Math.round((todayStats?.totalSeconds || 0) / 60);
  const goalProgress = Math.min(100, (todayMinutes / settings.dailyGoalMinutes) * 100);
  const isOverGoal = todayMinutes > settings.dailyGoalMinutes;

  // Weekly totals
  const weeklyMinutes = last7Days.reduce((sum, d) => sum + Math.round(d.totalSeconds / 60), 0);
  const weeklyVideos = last7Days.reduce((sum, d) => sum + d.videoCount, 0);
  const weeklyProductive = last7Days.reduce((sum, d) => sum + d.productiveVideos, 0);
  const weeklyUnproductive = last7Days.reduce((sum, d) => sum + d.unproductiveVideos, 0);

  // Previous week for comparison
  const prevWeekMinutes = (() => {
    let total = 0;
    for (let i = 13; i >= 7; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      total += Math.round((dailyStats[key]?.totalSeconds || 0) / 60);
    }
    return total;
  })();
  const weeklyChange = prevWeekMinutes > 0 
    ? Math.round(((weeklyMinutes - prevWeekMinutes) / prevWeekMinutes) * 100) 
    : 0;

  // Hourly heatmap data
  const hourlyData = (() => {
    const hours: number[] = Array(24).fill(0);
    last7Days.forEach(day => {
      if (day.hourlySeconds) {
        Object.entries(day.hourlySeconds).forEach(([hour, secs]) => {
          hours[parseInt(hour)] += secs;
        });
      }
    });
    return hours.map((secs, hour) => ({
      hour,
      minutes: Math.round(secs / 60),
    }));
  })();

  // Productivity pie data
  const productivityData = [
    { name: 'Productive', value: weeklyProductive, color: COLORS.productive },
    { name: 'Neutral', value: last7Days.reduce((sum, d) => sum + d.neutralVideos, 0), color: COLORS.neutral },
    { name: 'Unproductive', value: weeklyUnproductive, color: COLORS.unproductive },
  ].filter(d => d.value > 0);

  // Chart data
  const weeklyChartData = last7Days.map((d) => ({
    name: DAY_NAMES[new Date(d.date).getDay()],
    minutes: Math.round(d.totalSeconds / 60),
    goal: settings.dailyGoalMinutes,
  }));

  const monthlyChartData = last30Days.map((d, i) => ({
    day: i + 1,
    minutes: d.minutes,
  }));

  // Level calculation
  const level = Math.floor(xp / 100) + 1;

  // ===== Actions =====

  const saveSettings = async () => {
    await chrome.storage.local.set({ settings });
    chrome.runtime.sendMessage({ type: 'SET_GOAL_MODE', data: { mode: settings.goalMode } });
    chrome.runtime.sendMessage({ type: 'SET_CHALLENGE_TIER', data: { tier: settings.challengeTier } });
  };

  const handleSignIn = async () => {
    setAuthLoading(true);
    chrome.runtime.sendMessage({ type: 'AUTH_SIGN_IN' }, (response) => {
      setAuthLoading(false);
      if (response?.success && response.user) {
        setAuthUser(response.user);
        setSettings(prev => ({
          ...prev,
          backend: { ...prev.backend, userId: response.user.id, enabled: true }
        }));
      }
    });
  };

  const handleSignOut = async () => {
    setAuthLoading(true);
    chrome.runtime.sendMessage({ type: 'AUTH_SIGN_OUT' }, (response) => {
      setAuthLoading(false);
      if (response?.success) {
        setAuthUser(null);
        setSettings(prev => ({
          ...prev,
          backend: { ...prev.backend, userId: '', enabled: false }
        }));
      }
    });
  };

  // ===== Render =====

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/50" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧘</span>
            <div>
              <h1 className="text-xl font-bold">YouTube Detox</h1>
              <p className="text-xs text-white/50">
                {lastUpdated && `Updated ${lastUpdated.toLocaleTimeString()}`}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* User / Auth */}
            {authUser ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full">
                {authUser.picture && (
                  <img src={authUser.picture} alt="" className="w-6 h-6 rounded-full" />
                )}
                <span className="text-sm">{authUser.name}</span>
                <button onClick={handleSignOut} className="ml-2 text-white/50 hover:text-white">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleSignIn}
                disabled={authLoading}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm flex items-center gap-2"
              >
                {authLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />}
                Sign In
              </button>
            )}
            
            {/* Refresh */}
            <button
              onClick={fetchData}
              className="p-2 hover:bg-white/10 rounded-lg"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            
            {/* Settings Toggle */}
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="p-2 hover:bg-white/10 rounded-lg"
            >
              <SettingsIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Settings Panel (Collapsible) */}
        {settingsOpen && (
          <Card className="mb-8 bg-white/5 border-white/10">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <SettingsIcon className="w-5 h-5" />
                Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Goal Mode */}
                <div>
                  <Label className="text-white/70 mb-2 block">Goal Mode</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.entries(GOAL_MODES) as [GoalMode, typeof GOAL_MODES[GoalMode]][]).map(([mode, config]) => (
                      <button
                        key={mode}
                        onClick={() => setSettings(p => ({ ...p, goalMode: mode }))}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          settings.goalMode === mode
                            ? 'border-blue-500 bg-blue-500/20'
                            : 'border-white/10 hover:border-white/30'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {config.icon}
                          <span className="font-medium">{config.label}</span>
                        </div>
                        <span className="text-xs text-white/50">{config.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Challenge Tier */}
                <div>
                  <Label className="text-white/70 mb-2 block">Challenge Tier</Label>
                  <div className="space-y-2">
                    {(Object.entries(CHALLENGE_TIERS) as [ChallengeTier, typeof CHALLENGE_TIERS[ChallengeTier]][]).map(([tier, config]) => (
                      <button
                        key={tier}
                        onClick={() => setSettings(p => ({ ...p, challengeTier: tier, dailyGoalMinutes: config.goalMinutes }))}
                        className={`w-full p-2 rounded-lg border text-left flex items-center justify-between ${
                          settings.challengeTier === tier
                            ? 'border-purple-500 bg-purple-500/20'
                            : 'border-white/10 hover:border-white/30'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span>{config.icon}</span>
                          <span>{config.label}</span>
                        </span>
                        <span className="text-xs text-white/50">{config.goalMinutes}m • {config.xpMultiplier}x XP</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Friction Effects */}
                <div>
                  <Label className="text-white/70 mb-2 block">Friction Effects</Label>
                  <div className="space-y-3">
                    {[
                      { key: 'thumbnails', label: 'Blur Thumbnails', icon: <Eye className="w-4 h-4" /> },
                      { key: 'sidebar', label: 'Hide Sidebar', icon: <Sidebar className="w-4 h-4" /> },
                      { key: 'comments', label: 'Reduce Comments', icon: <MessageSquare className="w-4 h-4" /> },
                      { key: 'autoplay', label: 'Control Autoplay', icon: <Play className="w-4 h-4" /> },
                    ].map(({ key, label, icon }) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-sm">
                          {icon}
                          {label}
                        </span>
                        <Switch
                          checked={(settings.frictionEnabled as any)[key]}
                          onCheckedChange={(v) => setSettings(p => ({
                            ...p,
                            frictionEnabled: { ...p.frictionEnabled, [key]: v }
                          }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="mt-6 flex justify-end">
                <button
                  onClick={saveSettings}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium"
                >
                  Save Settings
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
          {/* Today */}
          <Card className="bg-white/5 border-white/10 col-span-2">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/50 text-sm flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  Today
                </span>
                <span className={`text-sm ${isOverGoal ? 'text-red-400' : 'text-green-400'}`}>
                  {isOverGoal ? `+${formatMinutes(todayMinutes - settings.dailyGoalMinutes)} over` : `${formatMinutes(settings.dailyGoalMinutes - todayMinutes)} left`}
                </span>
              </div>
              <div className="text-3xl font-bold mb-2">{formatMinutes(todayMinutes)}</div>
              <Progress 
                value={goalProgress} 
                className={`h-2 ${isOverGoal ? '[&>div]:bg-red-500' : '[&>div]:bg-blue-500'}`}
              />
            </CardContent>
          </Card>

          {/* Streak */}
          <Card className="bg-gradient-to-br from-orange-500/20 to-red-500/20 border-orange-500/30">
            <CardContent className="p-4 text-center">
              <Flame className="w-6 h-6 mx-auto mb-1 text-orange-400" />
              <div className="text-2xl font-bold">{streak}</div>
              <div className="text-xs text-white/50">Day Streak</div>
            </CardContent>
          </Card>

          {/* Level */}
          <Card className="bg-gradient-to-br from-purple-500/20 to-blue-500/20 border-purple-500/30">
            <CardContent className="p-4 text-center">
              <Trophy className="w-6 h-6 mx-auto mb-1 text-purple-400" />
              <div className="text-2xl font-bold">{level}</div>
              <div className="text-xs text-white/50">{xp} XP</div>
            </CardContent>
          </Card>

          {/* Drift */}
          <Card className={`border ${
            drift?.level === 'critical' ? 'bg-red-500/20 border-red-500/30' :
            drift?.level === 'high' ? 'bg-orange-500/20 border-orange-500/30' :
            drift?.level === 'medium' ? 'bg-yellow-500/20 border-yellow-500/30' :
            'bg-green-500/20 border-green-500/30'
          }`}>
            <CardContent className="p-4 text-center">
              <Waves className="w-6 h-6 mx-auto mb-1" />
              <div className="text-2xl font-bold">{Math.round((drift?.current || 0) * 100)}%</div>
              <div className="text-xs text-white/50">Drift</div>
            </CardContent>
          </Card>

          {/* Videos Today */}
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4 text-center">
              <Video className="w-6 h-6 mx-auto mb-1 text-blue-400" />
              <div className="text-2xl font-bold">{todayStats?.videoCount || 0}</div>
              <div className="text-xs text-white/50">Videos</div>
            </CardContent>
          </Card>
        </div>

        {/* Main Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Weekly Chart */}
          <Card className="bg-white/5 border-white/10 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  This Week
                </span>
                <span className={`text-sm flex items-center gap-1 ${weeklyChange <= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {weeklyChange <= 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                  {Math.abs(weeklyChange)}% vs last week
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyChartData}>
                    <defs>
                      <linearGradient id="colorMin" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" tick={{ fill: '#888', fontSize: 12 }} tickLine={false} axisLine={false} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8 }}
                      formatter={(value) => [formatMinutes(value as number), 'Time']}
                    />
                    <Area
                      type="monotone"
                      dataKey="minutes"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorMin)"
                    />
                    <Line
                      type="monotone"
                      dataKey="goal"
                      stroke="#ef4444"
                      strokeWidth={1}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-between text-sm text-white/50 mt-2">
                <span>Total: {formatMinutes(weeklyMinutes)}</span>
                <span>{weeklyVideos} videos</span>
              </div>
            </CardContent>
          </Card>

          {/* Productivity Breakdown */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                Video Quality
              </CardTitle>
            </CardHeader>
            <CardContent>
              {productivityData.length > 0 ? (
                <>
                  <div className="h-32 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={productivityData}
                          cx="50%"
                          cy="50%"
                          innerRadius={35}
                          outerRadius={55}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {productivityData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 mt-2">
                    {productivityData.map((item) => (
                      <div key={item.name} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                          {item.name}
                        </span>
                        <span>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-40 flex items-center justify-center text-white/30">
                  No ratings yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Second Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Monthly Trend */}
          <Card className="bg-white/5 border-white/10 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-400" />
                Last 30 Days
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyChartData}>
                    <XAxis dataKey="day" tick={false} axisLine={false} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8 }}
                      formatter={(value) => [formatMinutes(value as number), 'Time']}
                      labelFormatter={(day) => `Day ${day}`}
                    />
                    <Bar dataKey="minutes" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Peak Hours */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                Peak Hours
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-6 gap-1">
                {hourlyData.map((h) => {
                  const maxMins = Math.max(...hourlyData.map(x => x.minutes), 1);
                  const intensity = h.minutes / maxMins;
                  return (
                    <div
                      key={h.hour}
                      className="aspect-square rounded flex items-center justify-center text-[10px]"
                      style={{
                        backgroundColor: `rgba(59, 130, 246, ${intensity * 0.8})`,
                      }}
                      title={`${formatHour(h.hour)}: ${h.minutes}m`}
                    >
                      {h.hour % 6 === 0 ? formatHour(h.hour).replace('am', '').replace('pm', '') : ''}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-white/30 mt-2">
                <span>12am</span>
                <span>12pm</span>
                <span>11pm</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Channels */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Tv className="w-4 h-4 text-purple-400" />
                Top Channels
              </CardTitle>
            </CardHeader>
            <CardContent>
              {channels.length > 0 ? (
                <div className="space-y-3">
                  {channels.slice(0, 6).map((channel, i) => {
                    const maxMinutes = channels[0]?.minutes || 1;
                    const percent = (channel.minutes / maxMinutes) * 100;
                    return (
                      <div key={channel.channel}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="truncate max-w-[200px]">{channel.channel}</span>
                          <span className="text-white/50">{formatMinutes(channel.minutes)}</span>
                        </div>
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-purple-500"
                            style={{ width: `${percent}%`, opacity: 1 - i * 0.12 }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-32 flex items-center justify-center text-white/30">
                  No channel data yet
                </div>
              )}
            </CardContent>
          </Card>

          {/* Achievements */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-400" />
                Achievements ({achievements.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {achievements.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {achievements.map((a) => (
                    <div
                      key={a.id}
                      className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 ${
                        a.rarity === 'legendary' ? 'bg-yellow-500/10 border-yellow-500/30' :
                        a.rarity === 'epic' ? 'bg-purple-500/10 border-purple-500/30' :
                        a.rarity === 'rare' ? 'bg-blue-500/10 border-blue-500/30' :
                        a.rarity === 'uncommon' ? 'bg-green-500/10 border-green-500/30' :
                        'bg-white/5 border-white/10'
                      }`}
                      title={a.description}
                    >
                      <span>{a.icon}</span>
                      <span>{a.name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-32 flex items-center justify-center text-white/30">
                  Keep using to unlock achievements!
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
