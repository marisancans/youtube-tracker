import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import {
  Video,
  TrendingUp,
  TrendingDown,
  Flame,
  Target,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Tv,
  Calendar,
  Zap,
  Eye,
  Brain,
  Shield,
  Rocket,
  Clock,
  BarChart2,
  Waves,
  Trophy,
} from 'lucide-react';

interface PhaseInfo {
  phase: 'observation' | 'awareness' | 'intervention' | 'reduction';
  daysRemaining: number;
  shouldNotify: boolean;
}

interface BaselineStats {
  avgDailyMinutes: number;
  avgDailyVideos: number;
  avgSessionMinutes: number;
  totalDays: number;
  peakHours: number[];
  topChannels: Array<{ channel: string; minutes: number }>;
  productivityRatio: number;
  recommendationRatio: number;
  completionRate: number;
  shortsRatio: number;
}

interface DailyData {
  date: string;
  totalSeconds: number;
  videoCount: number;
  productiveVideos: number;
  unproductiveVideos: number;
  neutralVideos: number;
}

interface ChannelData {
  channel: string;
  videoCount: number;
  totalMinutes: number;
}

interface WeeklyComparison {
  thisWeekMinutes: number;
  prevWeekMinutes: number;
  changePercent: number;
  thisWeekVideos: number;
  prevWeekVideos: number;
}

interface DriftHistory {
  timestamp: number;
  value: number;
}

interface DriftData {
  current: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  history: DriftHistory[];
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  xpReward: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  unlockedAt?: number;
}

interface DashboardStats {
  today: DailyData | null;
  last7Days: DailyData[];
  weekly: WeeklyComparison | null;
  channels: ChannelData[];
  streak: number;
  level: number;
  xp: number;
  phase: PhaseInfo | null;
  baseline: BaselineStats | null;
  drift: DriftData | null;
  challengeTier: string;
  goalMode: string;
  achievements: Achievement[];
}

interface BackendSettings {
  enabled: boolean;
  url: string;
  userId: string;
}

const COLORS = {
  productive: '#22c55e',
  neutral: '#fbbf24',
  unproductive: '#ef4444',
  primary: '#3b82f6',
  purple: '#a855f7',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatMinutes(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
}

export default function Dashboard({
  backend,
  dailyGoalMinutes,
}: {
  backend: BackendSettings;
  dailyGoalMinutes: number;
}) {
  const [stats, setStats] = useState<DashboardStats>({
    today: null,
    last7Days: [],
    weekly: null,
    channels: [],
    streak: 0,
    level: 1,
    xp: 0,
    phase: null,
    baseline: null,
    drift: null,
    challengeTier: 'casual',
    goalMode: 'time_reduction',
    achievements: [],
  });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      if (backend.enabled && backend.url) {
        // Fetch from backend
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (backend.userId) {
          headers['X-User-Id'] = backend.userId;
        }

        const [overviewRes, weeklyRes, channelsRes] = await Promise.all([
          fetch(`${backend.url}/stats/overview`, { headers }),
          fetch(`${backend.url}/stats/weekly`, { headers }),
          fetch(`${backend.url}/stats/channels?days=7`, { headers }),
        ]);

        if (overviewRes.ok) {
          const overview = await overviewRes.json();
          const weekly = weeklyRes.ok ? await weeklyRes.json() : null;
          const channelsData = channelsRes.ok ? await channelsRes.json() : { channels: [] };

          setStats((prev) => ({
            ...prev,
            today: overview.today,
            last7Days: overview.last7days || [],
            weekly: weekly
              ? {
                  thisWeekMinutes: weekly.this_week_minutes,
                  prevWeekMinutes: weekly.prev_week_minutes,
                  changePercent: weekly.change_percent,
                  thisWeekVideos: weekly.this_week_videos,
                  prevWeekVideos: weekly.prev_week_videos,
                }
              : null,
            channels: channelsData.channels || [],
          }));
        }
      } else {
        // Fetch from local storage
        const data = await chrome.storage.local.get(['dailyStats', 'videoSessions', 'streak', 'xp']);

        // Fetch phase and baseline info
        const phaseInfo = await new Promise<PhaseInfo>((resolve) => {
          chrome.runtime.sendMessage({ type: 'GET_PHASE_INFO' }, resolve);
        });

        const baselineStats = await new Promise<BaselineStats>((resolve) => {
          chrome.runtime.sendMessage({ type: 'GET_BASELINE_STATS' }, resolve);
        });
        const dailyStats = data.dailyStats || {};

        // Build last 7 days (this week)
        const last7Days: DailyData[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const key = d.toISOString().split('T')[0];
          const dayData = dailyStats[key];
          if (dayData) {
            last7Days.push({
              date: key,
              totalSeconds: dayData.totalSeconds,
              videoCount: dayData.videoCount,
              productiveVideos: dayData.productiveVideos || 0,
              unproductiveVideos: dayData.unproductiveVideos || 0,
              neutralVideos: dayData.neutralVideos || 0,
            });
          }
        }

        // Build previous week (days 7-13 ago)
        const prevWeekDays: DailyData[] = [];
        for (let i = 13; i >= 7; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const key = d.toISOString().split('T')[0];
          const dayData = dailyStats[key];
          if (dayData) {
            prevWeekDays.push({
              date: key,
              totalSeconds: dayData.totalSeconds,
              videoCount: dayData.videoCount,
              productiveVideos: dayData.productiveVideos || 0,
              unproductiveVideos: dayData.unproductiveVideos || 0,
              neutralVideos: dayData.neutralVideos || 0,
            });
          }
        }

        const todayKey = new Date().toISOString().split('T')[0];
        const today = dailyStats[todayKey] || null;

        // Calculate weekly comparison (only if we have data)
        const thisWeekSeconds = last7Days.reduce((sum, d) => sum + d.totalSeconds, 0);
        const thisWeekVideos = last7Days.reduce((sum, d) => sum + d.videoCount, 0);
        const prevWeekSeconds = prevWeekDays.reduce((sum, d) => sum + d.totalSeconds, 0);
        const prevWeekVideos = prevWeekDays.reduce((sum, d) => sum + d.videoCount, 0);

        const thisWeekMinutes = Math.floor(thisWeekSeconds / 60);
        const prevWeekMinutes = Math.floor(prevWeekSeconds / 60);

        // Calculate change percent (only if we have previous week data)
        let changePercent = 0;
        if (prevWeekMinutes > 0) {
          changePercent = Math.round(((thisWeekMinutes - prevWeekMinutes) / prevWeekMinutes) * 100);
        }

        // Weekly comparison is null if no data at all
        const hasWeeklyData = last7Days.length > 0 || prevWeekDays.length > 0;
        const weekly: WeeklyComparison | null = hasWeeklyData
          ? {
              thisWeekMinutes,
              prevWeekMinutes,
              changePercent,
              thisWeekVideos,
              prevWeekVideos,
            }
          : null;

        // Build channel stats from video sessions
        const videoSessions: any[] = data.videoSessions || [];
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

        const channels = Array.from(channelMap.entries())
          .map(([channel, data]) => ({
            channel,
            videoCount: data.videos,
            totalMinutes: Math.round(data.seconds / 60),
          }))
          .sort((a, b) => b.totalMinutes - a.totalMinutes)
          .slice(0, 5);

        // Fetch drift
        const driftData = await new Promise<DriftData | null>((resolve) => {
          chrome.runtime.sendMessage({ type: 'GET_DRIFT' }, (response) => {
            if (response && typeof response.drift === 'number') {
              resolve({
                current: response.drift,
                level: response.level,
                history: response.history || [],
              });
            } else {
              resolve(null);
            }
          });
        });

        // Get settings for tier and mode
        const settings = data.settings || {};

        // Fetch achievements
        const achievementsData = await new Promise<Achievement[]>((resolve) => {
          chrome.runtime.sendMessage({ type: 'GET_ACHIEVEMENTS' }, (response) => {
            resolve(response?.unlocked || []);
          });
        });

        // Get streak from background (it calculates properly)
        const streakData = await new Promise<{ streak: number }>((resolve) => {
          chrome.runtime.sendMessage({ type: 'GET_STREAK' }, (response) => {
            resolve(response || { streak: 0 });
          });
        });

        // Get XP if exists
        const xp = typeof data.xp === 'number' ? data.xp : 0;

        setStats({
          today,
          last7Days,
          weekly,
          channels,
          streak: streakData.streak,
          level: xp > 0 ? Math.floor(xp / 100) + 1 : 1,
          xp,
          phase: phaseInfo?.phase ? phaseInfo : null,
          baseline: baselineStats?.totalDays > 0 ? baselineStats : null,
          drift: driftData,
          challengeTier: settings.challengeTier || 'casual',
          goalMode: settings.goalMode || 'time_reduction',
          achievements: achievementsData,
        });
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  }, [backend]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Chart data
  const weeklyChartData = stats.last7Days.map((d) => ({
    name: DAY_NAMES[new Date(d.date).getDay()],
    minutes: Math.round(d.totalSeconds / 60),
    videos: d.videoCount,
    goal: dailyGoalMinutes,
  }));

  const productivityData = (() => {
    const productive = stats.last7Days.reduce((sum, d) => sum + d.productiveVideos, 0);
    const neutral = stats.last7Days.reduce((sum, d) => sum + d.neutralVideos, 0);
    const unproductive = stats.last7Days.reduce((sum, d) => sum + d.unproductiveVideos, 0);
    const total = productive + neutral + unproductive;
    if (total === 0) return [];
    return [
      { name: 'Productive', value: productive, color: COLORS.productive },
      { name: 'Neutral', value: neutral, color: COLORS.neutral },
      { name: 'Wasted', value: unproductive, color: COLORS.unproductive },
    ];
  })();

  const todayMinutes = stats.today ? Math.floor(stats.today.totalSeconds / 60) : 0;
  const goalProgress = Math.min(100, (todayMinutes / dailyGoalMinutes) * 100);
  const isOverGoal = todayMinutes > dailyGoalMinutes;

  const phaseConfig = {
    observation: {
      icon: Eye,
      color: 'blue',
      title: 'Observation Week',
      description: 'Learning your patterns',
      bgGradient: 'from-blue-500/10 to-cyan-500/10',
      borderColor: 'border-blue-500/30',
      textColor: 'text-blue-600',
    },
    awareness: {
      icon: Brain,
      color: 'purple',
      title: 'Awareness Phase',
      description: 'Building mindfulness',
      bgGradient: 'from-purple-500/10 to-pink-500/10',
      borderColor: 'border-purple-500/30',
      textColor: 'text-purple-600',
    },
    intervention: {
      icon: Shield,
      color: 'orange',
      title: 'Intervention Phase',
      description: 'Active habit change',
      bgGradient: 'from-orange-500/10 to-yellow-500/10',
      borderColor: 'border-orange-500/30',
      textColor: 'text-orange-600',
    },
    reduction: {
      icon: Rocket,
      color: 'green',
      title: 'Reduction Phase',
      description: 'Sustaining progress',
      bgGradient: 'from-green-500/10 to-emerald-500/10',
      borderColor: 'border-green-500/30',
      textColor: 'text-green-600',
    },
  };

  const currentPhaseConfig = stats.phase ? phaseConfig[stats.phase.phase] : null;
  const PhaseIcon = currentPhaseConfig?.icon || Eye;

  return (
    <div className="space-y-4">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Dashboard</h2>
          {lastUpdated && <p className="text-xs text-muted-foreground">Updated {lastUpdated.toLocaleTimeString()}</p>}
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Phase Banner */}
      {stats.phase && currentPhaseConfig && (
        <Card className={`bg-gradient-to-r ${currentPhaseConfig.bgGradient} ${currentPhaseConfig.borderColor} border`}>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-white/50 ${currentPhaseConfig.textColor}`}>
                  <PhaseIcon className="w-5 h-5" />
                </div>
                <div>
                  <div className={`font-semibold ${currentPhaseConfig.textColor}`}>{currentPhaseConfig.title}</div>
                  <div className="text-xs text-muted-foreground">{currentPhaseConfig.description}</div>
                </div>
              </div>
              {stats.phase.daysRemaining > 0 && (
                <div className="text-right">
                  <div className={`text-lg font-bold ${currentPhaseConfig.textColor}`}>{stats.phase.daysRemaining}</div>
                  <div className="text-xs text-muted-foreground">days left</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Baseline Stats (shown during observation) */}
      {stats.phase?.phase === 'observation' && stats.baseline && stats.baseline.totalDays > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-blue-500" />
              Your Baseline ({stats.baseline.totalDays} days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <div className="text-muted-foreground text-xs">Daily Average</div>
                <div className="font-bold">{formatMinutes(stats.baseline.avgDailyMinutes)}</div>
              </div>
              <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <div className="text-muted-foreground text-xs">Videos/Day</div>
                <div className="font-bold">{stats.baseline.avgDailyVideos}</div>
              </div>
              <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <div className="text-muted-foreground text-xs">Productive</div>
                <div className="font-bold text-green-600">{stats.baseline.productivityRatio}%</div>
              </div>
              <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <div className="text-muted-foreground text-xs">From Recs</div>
                <div className="font-bold text-orange-600">{stats.baseline.recommendationRatio}%</div>
              </div>
              {stats.baseline.peakHours.length > 0 && (
                <div className="col-span-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <div className="text-muted-foreground text-xs">Peak Hours</div>
                  <div className="font-bold flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {stats.baseline.peakHours.map((h) => `${h}:00`).join(', ')}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-500" />
            Today's Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.today ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl font-bold">{formatMinutes(todayMinutes)}</span>
                <span className={`text-sm ${isOverGoal ? 'text-red-500' : 'text-green-500'}`}>
                  {isOverGoal
                    ? `+${formatMinutes(todayMinutes - dailyGoalMinutes)} over`
                    : `${formatMinutes(dailyGoalMinutes - todayMinutes)} left`}
                </span>
              </div>
              <Progress value={goalProgress} className={isOverGoal ? '[&>div]:bg-red-500' : '[&>div]:bg-blue-500'} />
              <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                <span>0m</span>
                <span>{formatMinutes(dailyGoalMinutes)} goal</span>
              </div>
            </>
          ) : (
            <div className="py-4 text-center text-muted-foreground text-sm">No activity today yet.</div>
          )}
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="p-3">
          <div className="flex flex-col items-center">
            <Video className="w-4 h-4 text-purple-500 mb-1" />
            <span className="text-lg font-bold">{stats.today?.videoCount ?? '-'}</span>
            <span className="text-[10px] text-muted-foreground">Videos</span>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex flex-col items-center">
            <Flame className="w-4 h-4 text-orange-500 mb-1" />
            <span className="text-lg font-bold">{stats.streak > 0 ? stats.streak : '-'}</span>
            <span className="text-[10px] text-muted-foreground">Streak</span>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex flex-col items-center">
            <ThumbsUp className="w-4 h-4 text-green-500 mb-1" />
            <span className="text-lg font-bold">{stats.today?.productiveVideos ?? '-'}</span>
            <span className="text-[10px] text-muted-foreground">Good</span>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex flex-col items-center">
            <ThumbsDown className="w-4 h-4 text-red-500 mb-1" />
            <span className="text-lg font-bold">{stats.today?.unproductiveVideos ?? '-'}</span>
            <span className="text-[10px] text-muted-foreground">Wasted</span>
          </div>
        </Card>
      </div>

      {/* Weekly Trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-500" />
              This Week
            </span>
            {stats.weekly && stats.weekly.prevWeekMinutes > 0 && stats.weekly.changePercent !== 0 && (
              <span
                className={`text-sm flex items-center gap-1 ${
                  stats.weekly.changePercent < 0 ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {stats.weekly.changePercent < 0 ? (
                  <TrendingDown className="w-4 h-4" />
                ) : (
                  <TrendingUp className="w-4 h-4" />
                )}
                {Math.abs(stats.weekly.changePercent)}% vs last week
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.last7Days.length > 0 ? (
            <>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyChartData}>
                    <defs>
                      <linearGradient id="colorMinutes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis hide />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-slate-800 text-white px-2 py-1 rounded text-xs">
                              {formatMinutes(payload[0].value as number)} • {payload[0].payload.videos} videos
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="minutes"
                      stroke={COLORS.primary}
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorMinutes)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>Total: {formatMinutes(stats.weekly?.thisWeekMinutes ?? 0)}</span>
                <span>{stats.weekly?.thisWeekVideos ?? 0} videos</span>
              </div>
            </>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
              No data yet. Start watching to see your stats.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drift Card 🌊 */}
      {stats.drift && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Waves className="w-4 h-4 text-blue-500" />
                Drift
              </span>
              <span
                className={`text-lg font-bold ${
                  stats.drift.level === 'critical'
                    ? 'text-red-500'
                    : stats.drift.level === 'high'
                      ? 'text-orange-500'
                      : stats.drift.level === 'medium'
                        ? 'text-yellow-500'
                        : 'text-green-500'
                }`}
              >
                {Math.round(stats.drift.current * 100)}%
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Drift Progress Bar */}
            <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  stats.drift.level === 'critical'
                    ? 'bg-gradient-to-r from-red-500 to-red-600'
                    : stats.drift.level === 'high'
                      ? 'bg-gradient-to-r from-orange-500 to-orange-600'
                      : stats.drift.level === 'medium'
                        ? 'bg-gradient-to-r from-yellow-500 to-yellow-600'
                        : 'bg-gradient-to-r from-green-500 to-green-600'
                }`}
                style={{ width: `${stats.drift.current * 100}%` }}
              />
            </div>

            {/* Drift Level Labels */}
            <div className="flex justify-between text-xs text-muted-foreground mb-4">
              <span>Focused</span>
              <span>Drifting</span>
              <span>High</span>
              <span>Critical</span>
            </div>

            {/* Drift History Chart */}
            {stats.drift.history.length > 1 && (
              <div className="h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={stats.drift.history.map((h) => ({
                      time: new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                      drift: Math.round(h.value * 100),
                    }))}
                  >
                    <defs>
                      <linearGradient id="driftGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-slate-800 text-white px-2 py-1 rounded text-xs">
                              {payload[0].value}% drift at {payload[0].payload.time}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="drift"
                      stroke="#f97316"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#driftGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Current Status */}
            <div className="text-center text-sm mt-2">
              {stats.drift.level === 'low' && <span className="text-green-600">🎯 You're staying focused!</span>}
              {stats.drift.level === 'medium' && <span className="text-yellow-600">🌊 Starting to drift...</span>}
              {stats.drift.level === 'high' && <span className="text-orange-600">⚠️ Drifting from your goals</span>}
              {stats.drift.level === 'critical' && (
                <span className="text-red-600">🔴 High drift — friction active</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Challenge Tier Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-500" />
            Challenge Tier
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {stats.challengeTier === 'casual' && '🌱'}
                {stats.challengeTier === 'focused' && '🎯'}
                {stats.challengeTier === 'disciplined' && '⚡'}
                {stats.challengeTier === 'monk' && '🔥'}
                {stats.challengeTier === 'ascetic' && '💎'}
              </span>
              <div>
                <div className="font-semibold capitalize">{stats.challengeTier}</div>
                <div className="text-xs text-muted-foreground">
                  {stats.challengeTier === 'casual' && '60 min • 1.0x XP'}
                  {stats.challengeTier === 'focused' && '45 min • 1.5x XP'}
                  {stats.challengeTier === 'disciplined' && '30 min • 2.0x XP'}
                  {stats.challengeTier === 'monk' && '15 min • 3.0x XP'}
                  {stats.challengeTier === 'ascetic' && '5 min • 5.0x XP'}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium">
                {stats.goalMode === 'music' && '🎵 Music Mode'}
                {stats.goalMode === 'time_reduction' && '⏱️ Time Mode'}
                {stats.goalMode === 'strict' && '🔒 Strict Mode'}
                {stats.goalMode === 'cold_turkey' && '🧊 Cold Turkey'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Productivity Breakdown */}
      {productivityData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-500" />
              Video Quality (7 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="w-24 h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={productivityData}
                      cx="50%"
                      cy="50%"
                      innerRadius={25}
                      outerRadius={40}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {productivityData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                {productivityData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.name}
                    </span>
                    <span className="font-medium">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Channels */}
      {stats.channels.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Tv className="w-4 h-4 text-purple-500" />
              Top Channels (7 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.channels.slice(0, 5).map((channel, i) => {
                const maxMinutes = stats.channels[0]?.totalMinutes || 1;
                const percent = (channel.totalMinutes / maxMinutes) * 100;
                return (
                  <div key={channel.channel} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate max-w-[150px]" title={channel.channel}>
                        {channel.channel}
                      </span>
                      <span className="text-muted-foreground">{formatMinutes(channel.totalMinutes)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${percent}%`,
                          backgroundColor: COLORS.purple,
                          opacity: 1 - i * 0.15,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Achievements */}
      {stats.achievements.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-500" />
              Achievements ({stats.achievements.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.achievements.slice(0, 8).map((achievement) => (
                <div
                  key={achievement.id}
                  className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 ${
                    achievement.rarity === 'legendary'
                      ? 'bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border-yellow-500/30'
                      : achievement.rarity === 'epic'
                        ? 'bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/30'
                        : achievement.rarity === 'rare'
                          ? 'bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border-blue-500/30'
                          : achievement.rarity === 'uncommon'
                            ? 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/30'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                  }`}
                  title={achievement.description}
                >
                  <span className="text-lg">{achievement.icon}</span>
                  <span className="font-medium">{achievement.name}</span>
                </div>
              ))}
            </div>
            {stats.achievements.length > 8 && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                +{stats.achievements.length - 8} more achievements
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Data Source Indicator */}
      <div className="text-center text-xs text-muted-foreground">
        {backend.enabled ? (
          <span className="flex items-center justify-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Synced with backend
          </span>
        ) : (
          <span className="flex items-center justify-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
            Local data only
          </span>
        )}
      </div>
    </div>
  );
}
