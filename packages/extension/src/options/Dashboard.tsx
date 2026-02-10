import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
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
} from 'lucide-react';

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

interface DashboardStats {
  today: DailyData | null;
  last7Days: DailyData[];
  weekly: WeeklyComparison | null;
  channels: ChannelData[];
  streak: number;
  level: number;
  xp: number;
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
        const dailyStats = data.dailyStats || {};

        // Build last 7 days
        const last7Days: DailyData[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const key = d.toISOString().split('T')[0];
          const dayData = dailyStats[key];
          last7Days.push({
            date: key,
            totalSeconds: dayData?.totalSeconds || 0,
            videoCount: dayData?.videoCount || 0,
            productiveVideos: dayData?.productiveVideos || 0,
            unproductiveVideos: dayData?.unproductiveVideos || 0,
            neutralVideos: dayData?.neutralVideos || 0,
          });
        }

        const todayKey = new Date().toISOString().split('T')[0];
        const today = dailyStats[todayKey] || null;

        // Calculate weekly comparison
        const thisWeekSeconds = last7Days.slice(-7).reduce((sum, d) => sum + d.totalSeconds, 0);
        const thisWeekVideos = last7Days.slice(-7).reduce((sum, d) => sum + d.videoCount, 0);

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

        setStats({
          today,
          last7Days,
          weekly: {
            thisWeekMinutes: Math.floor(thisWeekSeconds / 60),
            prevWeekMinutes: 0, // Would need more historical data
            changePercent: 0,
            thisWeekVideos,
            prevWeekVideos: 0,
          },
          channels,
          streak: data.streak || 0,
          level: Math.floor((data.xp || 0) / 100) + 1,
          xp: data.xp || 0,
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

  return (
    <div className="space-y-4">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Dashboard</h2>
          {lastUpdated && (
            <p className="text-xs text-muted-foreground">
              Updated {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Today's Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-500" />
            Today's Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl font-bold">{formatMinutes(todayMinutes)}</span>
            <span className={`text-sm ${isOverGoal ? 'text-red-500' : 'text-green-500'}`}>
              {isOverGoal ? `+${formatMinutes(todayMinutes - dailyGoalMinutes)} over` : `${formatMinutes(dailyGoalMinutes - todayMinutes)} left`}
            </span>
          </div>
          <Progress
            value={goalProgress}
            className={isOverGoal ? '[&>div]:bg-red-500' : '[&>div]:bg-blue-500'}
          />
          <div className="flex justify-between mt-1 text-xs text-muted-foreground">
            <span>0m</span>
            <span>{formatMinutes(dailyGoalMinutes)} goal</span>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="p-3">
          <div className="flex flex-col items-center">
            <Video className="w-4 h-4 text-purple-500 mb-1" />
            <span className="text-lg font-bold">{stats.today?.videoCount || 0}</span>
            <span className="text-[10px] text-muted-foreground">Videos</span>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex flex-col items-center">
            <Flame className="w-4 h-4 text-orange-500 mb-1" />
            <span className="text-lg font-bold">{stats.streak}</span>
            <span className="text-[10px] text-muted-foreground">Streak</span>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex flex-col items-center">
            <ThumbsUp className="w-4 h-4 text-green-500 mb-1" />
            <span className="text-lg font-bold">{stats.today?.productiveVideos || 0}</span>
            <span className="text-[10px] text-muted-foreground">Good</span>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex flex-col items-center">
            <ThumbsDown className="w-4 h-4 text-red-500 mb-1" />
            <span className="text-lg font-bold">{stats.today?.unproductiveVideos || 0}</span>
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
            {stats.weekly && stats.weekly.changePercent !== 0 && (
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
                {Math.abs(stats.weekly.changePercent)}%
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
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
            <span>Total: {formatMinutes(stats.weekly?.thisWeekMinutes || 0)}</span>
            <span>{stats.weekly?.thisWeekVideos || 0} videos</span>
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
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
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
                      <span className="text-muted-foreground">
                        {formatMinutes(channel.totalMinutes)}
                      </span>
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
