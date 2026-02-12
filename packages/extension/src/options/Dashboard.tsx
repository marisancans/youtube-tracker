import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Clock,
  Star,
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

// ---------------------------------------------------------------------------
// Types (unchanged)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLORS = {
  productive: '#0d9488',   // teal — "Valuable Cargo"
  neutral: '#d4a574',      // gold — "Ballast"
  unproductive: '#991b1b', // storm-red — "Contraband"
  primary: '#0d9488',      // teal
  chartFill: '#5eead4',    // teal-light (seafoam end)
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

/** Format minutes as coordinate-style text: 42'30" */
function formatCoordinate(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}'00"`;
  return `${m}'00"`;
}

/** Section divider using rope + knot decoration */
function RopeDivider() {
  return (
    <div className="flex items-center justify-center gap-2 py-2 text-gold-dark">
      <WaveDecoration width={80} className="opacity-40" />
      <RopeKnot className="flex-shrink-0" />
      <WaveDecoration width={80} className="opacity-40" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // Data fetching (IDENTICAL to original)
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // Derived data (same logic, nautical presentation names)
  // -----------------------------------------------------------------------

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
      { name: 'Valuable Cargo', value: productive, color: COLORS.productive },
      { name: 'Ballast', value: neutral, color: COLORS.neutral },
      { name: 'Contraband', value: unproductive, color: COLORS.unproductive },
    ];
  })();

  const todayMinutes = stats.today ? Math.floor(stats.today.totalSeconds / 60) : 0;
  const goalProgress = Math.min(100, (todayMinutes / dailyGoalMinutes) * 100);
  const isOverGoal = todayMinutes > dailyGoalMinutes;

  // Focus score for compass: 100 = on track (north), 0 = way over (south)
  const focusScore = Math.max(0, Math.min(100, Math.round(100 - (todayMinutes / dailyGoalMinutes) * 100)));

  // -----------------------------------------------------------------------
  // Phase config — nautical themed
  // -----------------------------------------------------------------------

  const phaseConfig = {
    observation: {
      icon: Spyglass,
      title: 'Charting Unknown Waters',
      description: 'Surveying your viewing patterns',
      accent: 'border-l-teal',
      textColor: 'text-teal',
      bgClass: 'bg-teal/5',
    },
    awareness: {
      icon: CompassRoseIcon,
      title: 'Reading the Stars',
      description: 'Navigating toward awareness',
      accent: 'border-l-gold',
      textColor: 'text-gold-dark',
      bgClass: 'bg-gold/5',
    },
    intervention: {
      icon: ShipsWheel,
      title: 'Adjusting the Sails',
      description: 'Active course correction',
      accent: 'border-l-gold-dark',
      textColor: 'text-ink',
      bgClass: 'bg-gold-dark/5',
    },
    reduction: {
      icon: AnchorIcon,
      title: 'Steady as She Goes',
      description: 'Holding your course',
      accent: 'border-l-teal',
      textColor: 'text-teal',
      bgClass: 'bg-seafoam/10',
    },
  };

  const currentPhaseConfig = stats.phase ? phaseConfig[stats.phase.phase] : null;
  const PhaseIcon = currentPhaseConfig?.icon || Spyglass;

  // -----------------------------------------------------------------------
  // Challenge tier — nautical ranks
  // -----------------------------------------------------------------------

  const tierConfig: Record<string, { rank: string; icon: React.ReactNode; xpLabel: string }> = {
    casual: {
      rank: 'Deckhand',
      icon: <AnchorIcon size={20} className="text-gold-dark" />,
      xpLabel: '60 min -- 1.0x XP',
    },
    focused: {
      rank: 'Helmsman',
      icon: <ShipsWheel size={20} className="text-gold-dark" />,
      xpLabel: '45 min -- 1.5x XP',
    },
    disciplined: {
      rank: 'First Mate',
      icon: <CompassRose score={75} size={20} className="text-gold-dark" />,
      xpLabel: '30 min -- 2.0x XP',
    },
    monk: {
      rank: 'Captain',
      icon: <Star className="w-5 h-5 text-gold fill-gold" />,
      xpLabel: '15 min -- 3.0x XP',
    },
    ascetic: {
      rank: 'Admiral',
      icon: <Star className="w-5 h-5 text-gold fill-gold" />,
      xpLabel: '5 min -- 5.0x XP',
    },
  };

  const currentTier = tierConfig[stats.challengeTier] || tierConfig.casual;

  // -----------------------------------------------------------------------
  // Drift nautical messages
  // -----------------------------------------------------------------------

  const driftMessages: Record<string, { text: string; color: string }> = {
    low: { text: 'Calm seas -- steady as she goes', color: 'text-teal' },
    medium: { text: 'Choppy waters -- watch the horizon', color: 'text-gold-dark' },
    high: { text: 'Rough seas -- reef the sails!', color: 'text-storm-red' },
    critical: { text: 'STORM WARNING -- all hands on deck!', color: 'text-storm-red font-bold' },
  };

  // -----------------------------------------------------------------------
  // Achievement rarity border colors (maritime medal style)
  // -----------------------------------------------------------------------

  const rarityBorderColor: Record<string, string> = {
    common: '#cd7f32',
    uncommon: '#c0c0c0',
    rare: '#d4a574',
    epic: '#2563eb',
    legendary: '#d4a574',
  };

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------

  return (
    <div className="parchment-texture map-grid space-y-1 p-4 rounded-xl font-body animate-parchment-unfurl">

      {/* ============================================================= */}
      {/* HEADER — "Captain's Log"                                       */}
      {/* ============================================================= */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h2 className="font-display text-2xl text-ink tracking-tight ink-heading">
            Captain's Log
          </h2>
          {lastUpdated && (
            <p className="text-xs text-ink-light/60 font-mono coordinate-text mt-0.5">
              Last entry: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="p-2 rounded-lg border border-gold/40 bg-parchment hover:bg-parchment-dark transition-colors text-gold-dark"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <RopeDivider />

      {/* ============================================================= */}
      {/* PHASE BANNER                                                   */}
      {/* ============================================================= */}
      {stats.phase && currentPhaseConfig && (
        <Card
          variant="nautical"
          className={`border-l-4 ${currentPhaseConfig.accent} ${currentPhaseConfig.bgClass}`}
        >
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-parchment/80">
                  <PhaseIcon size={20} className={currentPhaseConfig.textColor} />
                </div>
                <div>
                  <div className={`font-display font-semibold ${currentPhaseConfig.textColor}`}>
                    {currentPhaseConfig.title}
                  </div>
                  <div className="text-xs text-ink-light/70 captains-log">
                    {currentPhaseConfig.description}
                  </div>
                </div>
              </div>
              {stats.phase.daysRemaining > 0 && (
                <div className="text-right">
                  <div className={`text-lg font-display font-bold ${currentPhaseConfig.textColor}`}>
                    {stats.phase.daysRemaining}
                  </div>
                  <div className="text-xs text-ink-light/60">days to port</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================= */}
      {/* BASELINE STATS (shown during observation)                      */}
      {/* ============================================================= */}
      {stats.phase?.phase === 'observation' && stats.baseline && stats.baseline.totalDays > 0 && (
        <Card variant="nautical">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 font-display text-ink">
              <Spyglass size={18} className="text-teal" />
              Survey Results ({stats.baseline.totalDays} days charted)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-2 bg-parchment-dark/40 rounded-lg border border-gold/20">
                <div className="text-ink-light/70 text-xs">Daily Voyage</div>
                <div className="font-bold text-ink font-mono coordinate-text">
                  {formatMinutes(stats.baseline.avgDailyMinutes)}
                </div>
              </div>
              <div className="p-2 bg-parchment-dark/40 rounded-lg border border-gold/20">
                <div className="text-ink-light/70 text-xs">Ships/Day</div>
                <div className="font-bold text-ink font-mono coordinate-text">
                  {stats.baseline.avgDailyVideos}
                </div>
              </div>
              <div className="p-2 bg-parchment-dark/40 rounded-lg border border-gold/20">
                <div className="text-ink-light/70 text-xs">Cargo Quality</div>
                <div className="font-bold text-teal font-mono coordinate-text">
                  {stats.baseline.productivityRatio}%
                </div>
              </div>
              <div className="p-2 bg-parchment-dark/40 rounded-lg border border-gold/20">
                <div className="text-ink-light/70 text-xs">From Currents</div>
                <div className="font-bold text-gold-dark font-mono coordinate-text">
                  {stats.baseline.recommendationRatio}%
                </div>
              </div>
              {stats.baseline.peakHours.length > 0 && (
                <div className="col-span-2 p-2 bg-parchment-dark/40 rounded-lg border border-gold/20">
                  <div className="text-ink-light/70 text-xs">Peak Tides</div>
                  <div className="font-bold text-ink flex items-center gap-1 font-mono coordinate-text">
                    <Clock className="w-3 h-3 text-gold-dark" />
                    {stats.baseline.peakHours.map((h) => `${h}:00`).join(', ')}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================= */}
      {/* TODAY'S HEADING                                                 */}
      {/* ============================================================= */}
      <Card variant="nautical">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 font-display text-ink">
            <CompassRose score={focusScore} size={28} className="text-ink" />
            Today's Heading
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.today ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl font-display font-bold text-ink coordinate-text">
                  {formatCoordinate(todayMinutes)}
                </span>
                <span className="text-sm font-mono coordinate-text text-ink-light/70">
                  / {formatCoordinate(dailyGoalMinutes)}
                </span>
              </div>
              <Progress
                value={goalProgress}
                variant="nautical"
                className={isOverGoal ? '[&>div]:bg-gradient-to-r [&>div]:from-storm-red [&>div]:to-storm-red/80' : ''}
              />
              <div className="flex justify-between mt-1.5 text-xs text-ink-light/60 font-mono coordinate-text">
                <span>0'00"</span>
                <span className={isOverGoal ? 'text-storm-red font-semibold' : 'text-teal'}>
                  {isOverGoal
                    ? `+${formatMinutes(todayMinutes - dailyGoalMinutes)} past charted course`
                    : `${formatMinutes(dailyGoalMinutes - todayMinutes)} to destination`}
                </span>
              </div>
            </>
          ) : (
            <div className="py-6 text-center text-ink-light/60 text-sm captains-log">
              No voyages logged today. The sea awaits.
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================================= */}
      {/* QUICK STATS — 4 parchment cards                                */}
      {/* ============================================================= */}
      <div className="grid grid-cols-4 gap-2">
        {/* Ships Spotted (videos) */}
        <Card variant="nautical" className="p-3">
          <div className="flex flex-col items-center">
            <ShipIcon drift={0} size={20} className="text-ink mb-1" />
            <span className="text-lg font-display font-bold text-ink">
              {stats.today?.videoCount ?? '-'}
            </span>
            <span className="text-[10px] text-ink-light/60">Ships Spotted</span>
          </div>
        </Card>

        {/* Lighthouse Beacon (streak) */}
        <Card variant="nautical" className="p-3">
          <div className="flex flex-col items-center">
            <Lighthouse size={20} beacon={stats.streak > 0} className="text-gold-dark mb-1" />
            <span className="text-lg font-display font-bold text-ink">
              {stats.streak > 0 ? stats.streak : '-'}
            </span>
            <span className="text-[10px] text-ink-light/60">Beacon</span>
          </div>
        </Card>

        {/* Fair Winds (productive) */}
        <Card variant="nautical" className="p-3">
          <div className="flex flex-col items-center">
            <span className="text-teal mb-1">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 10 Q5 6, 10 8 Q15 10, 18 6" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <path d="M2 14 Q5 10, 10 12 Q15 14, 18 10" stroke="currentColor" strokeWidth="1" opacity="0.5" fill="none" />
              </svg>
            </span>
            <span className="text-lg font-display font-bold text-teal">
              {stats.today?.productiveVideos ?? '-'}
            </span>
            <span className="text-[10px] text-ink-light/60">Fair Winds</span>
          </div>
        </Card>

        {/* Sirens' Call (unproductive) */}
        <Card variant="nautical" className="p-3">
          <div className="flex flex-col items-center">
            <span className="text-storm-red mb-1">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 2 L10 4 M10 16 L10 18 M4 10 L2 10 M18 10 L16 10" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="10" cy="10" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <circle cx="10" cy="10" r="1.5" fill="currentColor" />
              </svg>
            </span>
            <span className="text-lg font-display font-bold text-storm-red">
              {stats.today?.unproductiveVideos ?? '-'}
            </span>
            <span className="text-[10px] text-ink-light/60">Sirens' Call</span>
          </div>
        </Card>
      </div>

      <RopeDivider />

      {/* ============================================================= */}
      {/* NAVIGATION CHART (weekly trend)                                */}
      {/* ============================================================= */}
      <Card variant="nautical">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between font-display text-ink">
            <span className="flex items-center gap-2">
              <CompassRose score={50} size={20} className="text-ink-light" />
              Navigation Chart
            </span>
            {stats.weekly && stats.weekly.prevWeekMinutes > 0 && stats.weekly.changePercent !== 0 && (
              <span
                className={`text-sm flex items-center gap-1 font-body ${
                  stats.weekly.changePercent < 0 ? 'text-teal' : 'text-storm-red'
                }`}
              >
                {stats.weekly.changePercent < 0 ? (
                  <TrendingDown className="w-4 h-4" />
                ) : (
                  <TrendingUp className="w-4 h-4" />
                )}
                {Math.abs(stats.weekly.changePercent)}% vs last voyage
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.last7Days.length > 0 ? (
            <>
              <div className="h-36 map-grid rounded-lg p-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyChartData}>
                    <defs>
                      <linearGradient id="nauticalGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0d9488" stopOpacity={0.4} />
                        <stop offset="50%" stopColor="#5eead4" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#5eead4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: '#4a3728' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis hide />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-navy text-parchment px-3 py-1.5 rounded-lg text-xs border border-gold/30 font-mono">
                              {formatMinutes(payload[0].value as number)} -- {payload[0].payload.videos} ships
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    {/* Goal line (dashed gold "trade route") */}
                    <Area
                      type="monotone"
                      dataKey="goal"
                      stroke="#d4a574"
                      strokeWidth={1.5}
                      strokeDasharray="6 3"
                      fillOpacity={0}
                      fill="none"
                      dot={false}
                      activeDot={false}
                    />
                    {/* Actual data area */}
                    <Area
                      type="monotone"
                      dataKey="minutes"
                      stroke="#0d9488"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#nauticalGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-between text-xs text-ink-light/60 mt-2 font-mono coordinate-text">
                <span>Total voyage: {formatMinutes(stats.weekly?.thisWeekMinutes ?? 0)}</span>
                <span>{stats.weekly?.thisWeekVideos ?? 0} ships logged</span>
              </div>
              {/* Legend for dashed trade route */}
              <div className="flex items-center gap-2 mt-1 text-xs text-ink-light/50">
                <svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#d4a574" strokeWidth="1.5" strokeDasharray="4 2" /></svg>
                <span>Charted route ({formatMinutes(dailyGoalMinutes)} goal)</span>
              </div>
            </>
          ) : (
            <div className="h-36 flex items-center justify-center text-ink-light/50 text-sm captains-log map-grid rounded-lg">
              No charts drawn yet. Set sail to begin mapping.
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================================= */}
      {/* CURRENTS & TIDES (drift)                                       */}
      {/* ============================================================= */}
      {stats.drift && (
        <Card variant="nautical">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between font-display text-ink">
              <span className="flex items-center gap-2">
                <ShipIcon drift={stats.drift.current} size={24} className="text-ink" />
                Currents &amp; Tides
              </span>
              <span
                className={`text-lg font-display font-bold font-mono ${
                  stats.drift.level === 'critical'
                    ? 'text-storm-red'
                    : stats.drift.level === 'high'
                      ? 'text-storm-red/80'
                      : stats.drift.level === 'medium'
                        ? 'text-gold-dark'
                        : 'text-teal'
                }`}
              >
                {Math.round(stats.drift.current * 100)}%
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Wave intensity bar — gradient from teal to amber to storm */}
            <div className="h-3 rounded-full overflow-hidden mb-3 border border-gold/20">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${stats.drift.current * 100}%`,
                  background:
                    stats.drift.level === 'critical'
                      ? 'linear-gradient(90deg, #991b1b, #dc2626)'
                      : stats.drift.level === 'high'
                        ? 'linear-gradient(90deg, #f59e0b, #991b1b)'
                        : stats.drift.level === 'medium'
                          ? 'linear-gradient(90deg, #0d9488, #f59e0b)'
                          : 'linear-gradient(90deg, #0d9488, #5eead4)',
                }}
              />
            </div>

            {/* Wave-level labels */}
            <div className="flex justify-between text-xs text-ink-light/50 mb-4 font-mono coordinate-text">
              <span>Calm</span>
              <span>Choppy</span>
              <span>Rough</span>
              <span>Storm</span>
            </div>

            {/* Drift history chart */}
            {stats.drift.history.length > 1 && (
              <div className="h-24 map-grid rounded-lg">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={stats.drift.history.map((h) => ({
                      time: new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                      drift: Math.round(h.value * 100),
                    }))}
                  >
                    <defs>
                      <linearGradient id="driftNauticalGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d4a574" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#d4a574" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 10, fill: '#4a3728' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-navy text-parchment px-3 py-1.5 rounded-lg text-xs border border-gold/30 font-mono">
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
                      stroke="#b8956a"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#driftNauticalGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Animated wave decoration at bottom, intensity based on level */}
            <div className={`flex justify-center mt-2 text-teal-light ${
              stats.drift.level === 'critical'
                ? 'animate-wave-storm text-storm-red'
                : stats.drift.level === 'high'
                  ? 'animate-wave-medium text-gold-dark'
                  : stats.drift.level === 'medium'
                    ? 'animate-wave-gentle text-gold'
                    : 'animate-wave-gentle'
            }`}>
              <WaveDecoration width={200} />
            </div>

            {/* Status message */}
            <div className="text-center text-sm mt-2 captains-log">
              <span className={driftMessages[stats.drift.level]?.color || 'text-teal'}>
                {driftMessages[stats.drift.level]?.text || 'Calm seas'}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <RopeDivider />

      {/* ============================================================= */}
      {/* NAUTICAL RANK (challenge tier)                                  */}
      {/* ============================================================= */}
      <Card variant="nautical">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 font-display text-ink">
            <AnchorIcon size={18} className="text-gold-dark" />
            Rank &amp; Commission
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-parchment-dark/50 border border-gold/30">
                {currentTier.icon}
              </div>
              <div>
                <div className="font-display font-semibold text-ink text-lg">
                  {currentTier.rank}
                </div>
                <div className="text-xs text-ink-light/60 font-mono coordinate-text">
                  {currentTier.xpLabel}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-body text-ink-light">
                {stats.goalMode === 'music' && 'Shanty Mode'}
                {stats.goalMode === 'time_reduction' && 'Timed Voyage'}
                {stats.goalMode === 'strict' && 'Strict Orders'}
                {stats.goalMode === 'cold_turkey' && 'Dry Dock'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ============================================================= */}
      {/* SHIP'S MANIFEST (productivity pie)                              */}
      {/* ============================================================= */}
      {productivityData.length > 0 && (
        <Card variant="nautical">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 font-display text-ink">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gold-dark">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
              Ship's Manifest (7 days)
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
                    <span className="flex items-center gap-2 text-ink">
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-gold/30"
                        style={{ backgroundColor: item.color }}
                      />
                      {item.name}
                    </span>
                    <span className="font-mono font-medium text-ink coordinate-text">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================= */}
      {/* PORTS OF CALL (top channels)                                    */}
      {/* ============================================================= */}
      {stats.channels.length > 0 && (
        <Card variant="nautical">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 font-display text-ink">
              <AnchorIcon size={18} className="text-teal" />
              Ports of Call (7 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.channels.slice(0, 5).map((channel, i) => {
                const maxMinutes = stats.channels[0]?.totalMinutes || 1;
                const percent = (channel.totalMinutes / maxMinutes) * 100;
                return (
                  <div key={channel.channel} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate max-w-[150px] text-ink font-body" title={channel.channel}>
                        {channel.channel}
                      </span>
                      <span className="text-ink-light/70 font-mono coordinate-text text-xs">
                        {formatMinutes(channel.totalMinutes)} at port
                      </span>
                    </div>
                    <div className="h-2 bg-parchment-darker/50 rounded-full overflow-hidden border border-gold/15">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${percent}%`,
                          background: `linear-gradient(90deg, #b8956a, #d4a574)`,
                          opacity: 1 - i * 0.12,
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

      <RopeDivider />

      {/* ============================================================= */}
      {/* CREW'S QUARTERS (achievements)                                  */}
      {/* ============================================================= */}
      {stats.achievements.length > 0 && (
        <Card variant="nautical">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 font-display text-ink">
              <Star className="w-4 h-4 text-gold fill-gold" />
              Crew's Quarters ({stats.achievements.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.achievements.slice(0, 8).map((achievement) => {
                const borderColor = rarityBorderColor[achievement.rarity] || '#cd7f32';
                const isLegendary = achievement.rarity === 'legendary';
                return (
                  <div
                    key={achievement.id}
                    className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 bg-parchment-dark/30 ${
                      isLegendary ? 'animate-drift-pulse' : ''
                    }`}
                    style={{
                      border: `2px solid ${borderColor}`,
                      boxShadow: isLegendary
                        ? `0 0 8px ${borderColor}40, 0 0 16px ${borderColor}20`
                        : `0 1px 2px ${borderColor}15`,
                    }}
                    title={achievement.description}
                  >
                    <span className="text-lg">{achievement.icon}</span>
                    <span className="font-display font-medium text-ink text-xs">
                      {achievement.name}
                    </span>
                  </div>
                );
              })}
            </div>
            {stats.achievements.length > 8 && (
              <p className="text-xs text-ink-light/50 mt-2 text-center captains-log">
                +{stats.achievements.length - 8} more medals in the collection
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ============================================================= */}
      {/* DATA SOURCE INDICATOR                                           */}
      {/* ============================================================= */}
      <div className="text-center text-xs text-ink-light/50 pt-2 pb-1">
        {backend.enabled ? (
          <span className="flex items-center justify-center gap-1.5 font-mono coordinate-text">
            <span className="w-1.5 h-1.5 rounded-full bg-teal" />
            Compass synced with fleet headquarters
          </span>
        ) : (
          <span className="flex items-center justify-center gap-1.5 font-mono coordinate-text">
            <span className="w-1.5 h-1.5 rounded-full bg-gold" />
            Personal logbook only
          </span>
        )}
      </div>

      {/* Bottom wave decoration */}
      <div className="flex justify-center text-gold/30 animate-wave-gentle pb-2">
        <WaveDecoration width={250} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small helper wrapper so CompassRose can be used as a phase icon
// (the awareness phase needs a compass, but the icon prop expects a
//  component with {size, className} — same signature as Spyglass etc.)
// ---------------------------------------------------------------------------
function CompassRoseIcon({ size = 24, className }: { size?: number; className?: string }) {
  return <CompassRose score={75} size={size} className={className} />;
}
