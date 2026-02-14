import { useEffect, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { mergeLiveStats } from '@/lib/live-stats-merger';
import {
  CompassRose,
  ShipIcon,
  AnchorIcon,
  Lighthouse,
  ShipsWheel,
  Spyglass,
} from '@/components/nautical/NauticalIcons';
import type { DriftStateV2 } from '@yt-detox/shared';
import DriftRadar from '@/components/widget/DriftRadar';

// ===== Types =====

interface FullDailyStats {
  date: string;
  totalSeconds: number;
  activeSeconds: number;
  backgroundSeconds: number;
  sessionCount: number;
  avgSessionDurationSeconds: number;
  firstCheckTime?: string;
  videoCount: number;
  videosCompleted: number;
  videosAbandoned: number;
  shortsCount: number;
  uniqueChannels: number;
  searchCount: number;
  recommendationClicks: number;
  autoplayCount: number;
  autoplayCancelled: number;
  totalScrollPixels: number;
  avgScrollVelocity: number;
  thumbnailsHovered: number;
  thumbnailsClicked: number;
  pageReloads: number;
  backButtonPresses: number;
  tabSwitches: number;
  productiveVideos: number;
  unproductiveVideos: number;
  neutralVideos: number;
  promptsShown: number;
  promptsAnswered: number;
  interventionsShown: number;
  interventionsEffective: number;
  hourlySeconds: Record<string, number>;
  topChannels: Array<{ channel: string; minutes: number; videoCount: number }>;
  preSleepMinutes: number;
  bingeSessions: number;
}

interface VideoSessionEntry {
  source: string;
  isShort: boolean;
  watchedPercent: number;
  channel: string;
  watchedSeconds: number;
  timestamp: number;
  playbackSpeed: number;
  productivityRating: -1 | 0 | 1 | null;
}

interface DriftSnapshot {
  timestamp: number;
  drift: number;
  level: string;
}

// ===== Helpers =====

function fmt(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
}

function fmtSec(secs: number): string {
  return fmt(Math.round(secs / 60));
}

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function last7Keys(): string[] {
  const keys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    keys.push(d.toISOString().split('T')[0]);
  }
  return keys;
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

function pct(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

// ===== Chart Components =====

function Section({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-display font-semibold text-ink-light uppercase tracking-[0.15em] mb-3">
      {children}
    </h3>
  );
}

function HeroCard({
  value,
  label,
  sub,
  color = 'text-ink',
  icon,
}: {
  value: string | number;
  label: string;
  sub?: string;
  color?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="bg-parchment rounded-xl p-4 rope-border text-center">
      {icon && <div className="flex justify-center mb-1">{icon}</div>}
      <div className={`text-2xl font-display font-bold ${color} coordinate-text leading-tight`}>
        {value}
      </div>
      <div className="text-[11px] text-ink-light font-body mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-ink-light/60 font-mono mt-0.5">{sub}</div>}
    </div>
  );
}

function VBars({
  data,
  labels,
  height = 110,
  activeIdx,
  goalLine,
}: {
  data: number[];
  labels: string[];
  height?: number;
  activeIdx?: number;
  goalLine?: number;
}) {
  const max = Math.max(...data, goalLine || 0, 1);
  const goalY = goalLine !== undefined ? ((max - goalLine) / max) * height : undefined;

  return (
    <div className="relative">
      <div className="flex items-end gap-[2px]" style={{ height }}>
        {data.map((v, i) => {
          const h = (v / max) * 100;
          const active = i === activeIdx;
          const over = goalLine !== undefined && v > goalLine;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
              <div
                className="w-full rounded-t transition-all"
                style={{
                  height: `${Math.max(h, v > 0 ? 2 : 0)}%`,
                  background: over
                    ? '#991b1b'
                    : active
                      ? 'linear-gradient(to top, #b8956a, #d4a574)'
                      : '#d4a574',
                  opacity: active ? 1 : 0.65,
                  boxShadow: active ? '0 0 8px rgba(212,165,116,0.5)' : 'none',
                }}
                title={`${labels[i]}: ${v}`}
              />
            </div>
          );
        })}
      </div>
      {goalY !== undefined && goalLine !== undefined && goalLine <= max && (
        <div
          className="absolute left-0 right-0 border-t-2 border-dashed border-teal/60"
          style={{ top: goalY }}
        >
          <span className="absolute -top-3.5 right-0 text-[9px] text-teal font-mono bg-parchment/80 px-1 rounded">
            {fmt(goalLine)} goal
          </span>
        </div>
      )}
      <div className="flex gap-[2px] mt-1">
        {labels.map((l, i) => (
          <div key={i} className="flex-1 text-center">
            <span
              className={`text-[9px] ${i === activeIdx ? 'text-gold-dark font-bold' : 'text-ink-light/50'}`}
            >
              {l}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HBars({
  items,
  max,
}: {
  items: Array<{ label: string; value: number; sub?: string }>;
  max: number;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i}>
          <div className="flex items-center justify-between text-[11px] mb-0.5">
            <span className="text-ink font-body truncate max-w-[55%]">{item.label}</span>
            <span className="text-ink-light font-mono">{item.sub || item.value}</span>
          </div>
          <div className="h-2 bg-parchment-dark/30 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold-dark to-gold transition-all"
              style={{ width: `${max > 0 ? (item.value / max) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Donut({
  segments,
  size = 110,
  thickness = 14,
  center,
}: {
  segments: Array<{ value: number; color: string; label: string }>;
  size?: number;
  thickness?: number;
  center?: ReactNode;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  let cumDeg = 0;
  const parts: string[] = [];

  if (total === 0) {
    parts.push('#e8d5b7 0deg 360deg');
  } else {
    for (const seg of segments) {
      const deg = (seg.value / total) * 360;
      parts.push(`${seg.color} ${cumDeg}deg ${cumDeg + deg}deg`);
      cumDeg += deg;
    }
  }

  const inner = size - thickness * 2;

  return (
    <div>
      <div className="relative mx-auto" style={{ width: size, height: size }}>
        <div
          className="w-full h-full rounded-full"
          style={{ background: `conic-gradient(${parts.join(', ')})` }}
        />
        <div
          className="absolute bg-parchment rounded-full flex items-center justify-center"
          style={{ width: inner, height: inner, top: thickness, left: thickness }}
        >
          {center}
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-3">
        {segments
          .filter((s) => s.value > 0)
          .map((seg, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: seg.color }} />
              <span className="text-[10px] text-ink-light font-body">
                {seg.label} ({seg.value})
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

function DriftLine({
  points,
  height = 80,
  color = '#0d9488',
  fillColor,
  startLabel,
  endLabel,
}: {
  points: number[];
  height?: number;
  color?: string;
  fillColor?: string;
  startLabel?: string;
  endLabel?: string;
}) {
  if (points.length < 2) {
    return (
      <div className="text-xs text-ink-light/50 italic text-center py-6 captains-log">
        Building drift history...
      </div>
    );
  }

  const max = Math.max(...points, 0.01);
  const w = 300;
  const step = w / (points.length - 1);
  const pad = 4;

  const pts = points.map((p, i) => `${i * step},${height - pad - (p / max) * (height - pad * 2)}`);
  const poly = pts.join(' ');
  const fill = `0,${height} ${poly} ${(points.length - 1) * step},${height}`;

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        {fillColor && <polygon points={fill} fill={fillColor} />}
        <polyline points={poly} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={i * step}
            cy={height - pad - (p / max) * (height - pad * 2)}
            r="2"
            fill={color}
          />
        ))}
      </svg>
      {(startLabel || endLabel) && (
        <div className="flex justify-between mt-1 text-[9px] text-ink-light/60 font-mono">
          <span>{startLabel}</span>
          <span>{endLabel}</span>
        </div>
      )}
    </div>
  );
}

function StackedSegments({
  segments,
}: {
  segments: Array<{ value: number; color: string; label: string }>;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return <div className="h-2.5 bg-parchment-dark/30 rounded-full" />;

  return (
    <div>
      <div className="flex rounded-full overflow-hidden h-2.5">
        {segments.map((seg, i) => (
          <div
            key={i}
            style={{ width: `${(seg.value / total) * 100}%`, background: seg.color }}
            title={`${seg.label}: ${seg.value}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-2">
        {segments
          .filter((s) => s.value > 0)
          .map((seg, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ background: seg.color }} />
              <span className="text-[10px] text-ink-light">
                {seg.label}: {seg.value} ({pct(seg.value, total)}%)
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gold/10 last:border-0">
      <span className="text-[11px] text-ink-light font-body">{label}</span>
      <div className="text-right">
        <span className="text-sm font-display font-semibold text-ink">{value}</span>
        {sub && <span className="text-[10px] text-ink-light/60 ml-1">{sub}</span>}
      </div>
    </div>
  );
}

// ===== Source Colors =====

const SRC_COLORS: Record<string, string> = {
  search: '#0d9488',
  recommendation: '#d4a574',
  subscription: '#5eead4',
  autoplay: '#f59e0b',
  direct: '#64748b',
  shorts: '#991b1b',
  homepage: '#b8956a',
  notification: '#7c3aed',
  history: '#334155',
  end_screen: '#ea580c',
};

const RANK_MAP: Record<string, string> = {
  casual: 'Deckhand',
  focused: 'Helmsman',
  disciplined: 'First Mate',
  monk: 'Captain',
  ascetic: 'Admiral',
};

// ===== Main Component =====

export default function Dashboard() {
  const [dailyStats, setDailyStats] = useState<Record<string, FullDailyStats>>({});
  const [videoSessions, setVideoSessions] = useState<VideoSessionEntry[]>([]);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [xp, setXp] = useState(0);
  const [drift, setDrift] = useState(0);
  const [driftLevel, setDriftLevel] = useState('low');
  const [driftHistory, setDriftHistory] = useState<DriftSnapshot[]>([]);
  const [driftFactors, setDriftFactors] = useState<Record<string, number> | null>(null);
  const [driftV2, setDriftV2] = useState<DriftStateV2 | null>(null);
  const [streak, setStreak] = useState(0);
  const [achieveUnlocked, setAchieveUnlocked] = useState(0);
  const [achieveTotal, setAchieveTotal] = useState(0);
  const [tier, setTier] = useState('casual');
  const [loading, setLoading] = useState(true);

  // --- Fetch ---
  const fetchAll = useCallback(() => {
    chrome.storage.local.get(null, (data) => {
      const stats = data.dailyStats ? { ...data.dailyStats } : {};
      // Merge live session into today's stats for display
      const tk = new Date().toISOString().split('T')[0];
      const merged = mergeLiveStats(stats[tk], {
        liveSession: data.liveSession,
        liveTemporal: data.liveTemporal,
        liveSessionUpdatedAt: data.liveSessionUpdatedAt,
      });
      if (merged) stats[tk] = merged;
      setDailyStats(stats);
      if (data.videoSessions) setVideoSessions(data.videoSessions);
      if (data.settings) setSettings(data.settings);
      if (typeof data.xp === 'number') setXp(data.xp);
      setLoading(false);
    });

    chrome.runtime.sendMessage({ type: 'GET_DRIFT' }, (r) => {
      if (r && typeof r.drift === 'number') {
        setDrift(r.drift);
        setDriftLevel(r.level || 'low');
        if (r.factors) setDriftFactors(r.factors);
      }
    });

    chrome.runtime.sendMessage({ type: 'GET_DRIFT_HISTORY' }, (r) => {
      const items = Array.isArray(r) ? r : Array.isArray(r?.snapshots) ? r.snapshots : [];
      setDriftHistory(
        items.map((s: any) => ({
          timestamp: s.timestamp,
          drift: s.drift ?? s.value ?? 0,
          level: s.level || 'low',
        })),
      );
    });

    chrome.runtime.sendMessage({ type: 'GET_DRIFT_V2' }, (r) => {
      if (r?.composite !== undefined) setDriftV2(r);
    });

    chrome.runtime.sendMessage({ type: 'GET_STREAK' }, (r) => {
      if (r) setStreak(r.streak || 0);
    });

    chrome.runtime.sendMessage({ type: 'GET_ACHIEVEMENTS' }, (r) => {
      if (r) {
        setAchieveUnlocked(r.unlocked?.length || 0);
        setAchieveTotal(r.all?.length || 0);
      }
    });

    chrome.runtime.sendMessage({ type: 'GET_CHALLENGE_PROGRESS' }, (r) => {
      if (r?.tier) setTier(r.tier);
    });
  }, []);

  useEffect(() => {
    fetchAll();

    // React to storage changes instead of polling
    const WATCH_KEYS = new Set(['dailyStats', 'liveSession', 'liveTemporal', 'liveSessionUpdatedAt', 'authState', 'videoSessions', 'xp', 'driftV2State']);
    const onChanged = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (Object.keys(changes).some((k) => WATCH_KEYS.has(k))) {
        fetchAll();
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [fetchAll]);

  // --- Computed ---
  const tk = todayKey();
  const today = dailyStats[tk];
  const keys7 = useMemo(() => last7Keys(), []);
  const stats7 = useMemo(() => keys7.map((k) => dailyStats[k] || null), [keys7, dailyStats]);

  // Use activeSeconds if available, fall back to totalSeconds for data collected before tracking fix
  const todayActiveMin = today ? Math.round(((today.activeSeconds || today.totalSeconds || 0)) / 60) : 0;
  const todayTotalMin = today ? Math.round((today.totalSeconds || 0) / 60) : 0;
  const todayBgMin = today ? Math.round((today.backgroundSeconds || 0) / 60) : 0;
  // 24h bars
  const hourly = useMemo(() => {
    const hrs: number[] = [];
    for (let i = 0; i < 24; i++) hrs.push(Math.round((today?.hourlySeconds?.[i.toString()] || 0) / 60));
    return hrs;
  }, [today]);
  const hourLabels = useMemo(
    () => Array.from({ length: 24 }, (_, i) => (i % 3 === 0 ? `${i}` : '')),
    [],
  );

  // 7-day bars
  const weekMin = useMemo(
    () => stats7.map((d) => (d ? Math.round((d.activeSeconds || d.totalSeconds || 0) / 60) : 0)),
    [stats7],
  );
  const weekLabels = useMemo(() => keys7.map((k) => dayLabel(k)), [keys7]);

  // Productivity
  const prod = today?.productiveVideos || 0;
  const unprod = today?.unproductiveVideos || 0;
  const neut = today?.neutralVideos || 0;
  const totalRated = prod + unprod + neut;

  // Content sources
  const sources = useMemo(() => {
    const start = new Date(tk).getTime();
    const todaySess = videoSessions.filter((s) => s.timestamp >= start);
    const counts: Record<string, number> = {};
    for (const s of todaySess) counts[s.source || 'direct'] = (counts[s.source || 'direct'] || 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => ({ source, count }));
  }, [videoSessions, tk]);

  // Top channels
  const channels = useMemo(() => (today?.topChannels || []).slice(0, 8), [today]);
  const maxChMin = channels.length > 0 ? Math.max(...channels.map((c) => c.minutes)) : 1;

  // Drift line
  const driftPts = useMemo(() => driftHistory.map((s) => s.drift), [driftHistory]);
  const driftStart = useMemo(() => {
    if (driftHistory.length === 0) return '';
    const d = new Date(driftHistory[0].timestamp);
    return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
  }, [driftHistory]);
  const driftEnd = useMemo(() => {
    if (driftHistory.length === 0) return '';
    const d = new Date(driftHistory[driftHistory.length - 1].timestamp);
    return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
  }, [driftHistory]);

  // Weekly aggregates
  const weekTotals = useMemo(() => {
    let active = 0,
      videos = 0,
      sessions = 0,
      productive = 0,
      unproductive = 0,
      search = 0,
      recClicks = 0,
      autoplay = 0,
      shorts = 0,
      binge = 0;
    for (const d of stats7) {
      if (!d) continue;
      active += d.activeSeconds || 0;
      videos += d.videoCount || 0;
      sessions += d.sessionCount || 0;
      productive += d.productiveVideos || 0;
      unproductive += d.unproductiveVideos || 0;
      search += d.searchCount || 0;
      recClicks += d.recommendationClicks || 0;
      autoplay += d.autoplayCount || 0;
      shorts += d.shortsCount || 0;
      binge += d.bingeSessions || 0;
    }
    return {
      activeMin: Math.round(active / 60),
      videos,
      sessions,
      productive,
      unproductive,
      search,
      recClicks,
      autoplay,
      shorts,
      binge,
      avgDailyMin: Math.round(active / 60 / 7),
    };
  }, [stats7]);

  // Active vs BG 7-day
  const weekActive = useMemo(
    () => stats7.map((d) => (d ? Math.round((d.activeSeconds || d.totalSeconds || 0) / 60) : 0)),
    [stats7],
  );
  const weekBg = useMemo(
    () => stats7.map((d) => (d ? Math.round((d.backgroundSeconds || 0) / 60) : 0)),
    [stats7],
  );

  const level = Math.floor(xp / 100) + 1;
  const xpInLevel = xp % 100;
  const rank = RANK_MAP[tier] || 'Deckhand';
  const currentHour = new Date().getHours();

  // --- Loading ---
  if (loading) {
    return (
      <div className="min-h-screen parchment-texture map-grid flex items-center justify-center">
        <ShipsWheel size={48} className="text-gold animate-compass-spin" />
      </div>
    );
  }

  // --- Render ---
  return (
    <div className="min-h-screen parchment-texture map-grid font-body">
      {/* Header */}
      <header className="bg-navy sticky top-0 z-50 shadow-lg">
        <div className="w-full px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-gold-dark to-gold flex items-center justify-center">
              <ShipsWheel size={18} className="text-navy" />
            </div>
            <div>
              <h1 className="text-base font-display font-semibold text-parchment">
                Captain's Dashboard
              </h1>
              <p className="text-[11px] text-parchment-darker font-body">
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-parchment-darker">
              {rank} / Lv.{level}
            </span>
            <button
              onClick={() => {
                window.location.hash = '';
              }}
              className="px-3 py-1.5 bg-navy-light hover:bg-gold/20 border border-gold/30 rounded-lg text-sm text-parchment font-body flex items-center gap-2 transition-colors"
            >
              <ShipsWheel size={14} className="text-gold" />
              Settings
            </button>
            <button
              onClick={fetchAll}
              className="px-3 py-1.5 bg-navy-light hover:bg-gold/20 border border-gold/30 rounded-lg text-sm text-parchment font-body transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="w-full px-6 py-6">
        <div className="grid grid-cols-6 gap-4 max-w-[1800px] mx-auto">
          {/* ═══ ROW 1: Hero Stats ═══ */}
          <HeroCard
            value={fmt(todayActiveMin)}
            label="Rolling 24h"
            sub={`${today?.sessionCount || 0} sessions`}
            color="text-ink"
            icon={
              <CompassRose
                score={Math.max(0, 100 - Math.round((driftV2 ? driftV2.composite : drift) * 100))}
                size={24}
                className="text-gold"
              />
            }
          />
          <HeroCard
            value={today?.videoCount || 0}
            label="Videos"
            sub={`${today?.shortsCount || 0} shorts`}
            icon={<Spyglass size={20} className="text-gold" />}
          />
          <HeroCard
            value={streak}
            label="Day Streak"
            icon={<Lighthouse size={20} beacon className="text-gold" />}
          />
          <HeroCard
            value={`Lv.${level}`}
            label={rank}
            sub={`${xpInLevel}/100 XP`}
            icon={<AnchorIcon size={20} className="text-gold" />}
          />
          <HeroCard
            value={`${Math.round((driftV2 ? driftV2.composite : drift) * 100)}%`}
            label="Drift"
            sub={driftV2 ? driftV2.level : driftLevel}
            color={
              (driftV2 ? driftV2.level : driftLevel) === 'storm' || driftLevel === 'critical'
                ? 'text-storm-red'
                : (driftV2 ? driftV2.level : driftLevel) === 'rough' || driftLevel === 'high'
                  ? 'text-[#f59e0b]'
                  : (driftV2 ? driftV2.level : driftLevel) === 'choppy' || driftLevel === 'medium'
                    ? 'text-[#eab308]'
                    : 'text-teal'
            }
            icon={<ShipIcon drift={driftV2 ? driftV2.composite : drift} size={20} className="text-gold" />}
          />
          <HeroCard
            value={today?.sessionCount || 0}
            label="Sessions"
            sub={
              today?.avgSessionDurationSeconds
                ? `avg ${fmtSec(today.avgSessionDurationSeconds)}`
                : undefined
            }
          />

          {/* ═══ DRIFT ANALYSIS ═══ */}
          <div className="col-span-6 bg-parchment rounded-xl p-5 rope-border">
            <Section>Drift Analysis</Section>
            {driftV2 ? (
              <div className="flex flex-col md:flex-row gap-6 items-start">
                {/* Left: Radar chart */}
                <div className="flex-shrink-0 flex justify-center">
                  <DriftRadar axes={driftV2.axes} size={200} showLabels />
                </div>

                {/* Right: Composite + Axes */}
                <div className="flex-1 min-w-0">
                  {/* Composite + Sea State */}
                  <div className="flex items-baseline gap-3 mb-4">
                    <span
                      className={`text-4xl font-display font-bold coordinate-text ${
                        driftV2.level === 'storm'
                          ? 'text-[#ef4444]'
                          : driftV2.level === 'rough'
                            ? 'text-[#f59e0b]'
                            : driftV2.level === 'choppy'
                              ? 'text-[#eab308]'
                              : 'text-teal'
                      }`}
                    >
                      {Math.round(driftV2.composite * 100)}%
                    </span>
                    <span
                      className={`text-sm font-display font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${
                        driftV2.level === 'storm'
                          ? 'bg-red-900/20 text-[#ef4444]'
                          : driftV2.level === 'rough'
                            ? 'bg-amber-900/20 text-[#f59e0b]'
                            : driftV2.level === 'choppy'
                              ? 'bg-yellow-900/20 text-[#eab308]'
                              : 'bg-teal-900/20 text-teal'
                      }`}
                    >
                      {driftV2.level}
                    </span>
                  </div>

                  {/* Axis bars */}
                  <div className="space-y-3">
                    {[
                      {
                        label: 'Time Pressure',
                        value: driftV2.axes.timePressure.value,
                        color: '#f59e0b',
                      },
                      {
                        label: 'Content Quality',
                        value: driftV2.axes.contentQuality.value,
                        color: '#3b82f6',
                      },
                      {
                        label: 'Behavior',
                        value: driftV2.axes.behaviorPattern.value,
                        color: '#a855f7',
                      },
                      {
                        label: 'Circadian',
                        value: driftV2.axes.circadian,
                        color: '#6366f1',
                      },
                    ].map((axis) => (
                      <div key={axis.label}>
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="text-ink font-body">{axis.label}</span>
                          <span className="text-ink-light font-mono">
                            {Math.round(axis.value * 100)}%
                          </span>
                        </div>
                        <div className="h-2.5 bg-parchment-dark/30 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.round(axis.value * 100)}%`,
                              backgroundColor: axis.color,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row gap-6 items-start animate-pulse">
                <div className="flex-shrink-0 w-[200px] h-[200px] bg-parchment-dark/20 rounded-full" />
                <div className="flex-1 space-y-4">
                  <div className="h-10 w-32 bg-parchment-dark/20 rounded" />
                  <div className="space-y-3">
                    <div className="h-2.5 bg-parchment-dark/20 rounded-full" />
                    <div className="h-2.5 bg-parchment-dark/20 rounded-full" />
                    <div className="h-2.5 bg-parchment-dark/20 rounded-full" />
                    <div className="h-2.5 bg-parchment-dark/20 rounded-full" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ═══ ROW 2: 24h Activity + Productivity ═══ */}
          <div className="col-span-4 bg-parchment rounded-xl p-5 rope-border">
            <Section>24-Hour Activity (minutes per hour)</Section>
            <VBars data={hourly} labels={hourLabels} height={120} activeIdx={currentHour} />
          </div>

          <div className="col-span-2 bg-parchment rounded-xl p-5 rope-border">
            <Section>Video Ratings</Section>
            {totalRated > 0 ? (
              <Donut
                segments={[
                  { value: prod, color: '#0d9488', label: 'Productive' },
                  { value: neut, color: '#d4a574', label: 'Neutral' },
                  { value: unprod, color: '#991b1b', label: 'Unproductive' },
                ]}
                center={<span className="text-lg font-display font-bold text-ink">{totalRated}</span>}
              />
            ) : (
              <div className="flex items-center justify-center h-32 text-sm text-ink-light/50 italic captains-log">
                No ratings yet today
              </div>
            )}
          </div>

          {/* ═══ ROW 3: 7-Day Trend + Drift History ═══ */}
          <div className="col-span-4 bg-parchment rounded-xl p-5 rope-border">
            <Section>7-Day Usage Trend</Section>
            <VBars
              data={weekMin}
              labels={weekLabels}
              height={120}
              activeIdx={6}
            />
            <div className="flex justify-between mt-2 text-[10px] text-ink-light font-mono">
              <span>Week total: {fmt(weekTotals.activeMin)}</span>
              <span>Avg: {fmt(weekTotals.avgDailyMin)}/day</span>
            </div>
          </div>

          <div className="col-span-2 bg-parchment rounded-xl p-5 rope-border">
            <Section>Drift Over Time</Section>
            <DriftLine
              points={driftPts}
              height={80}
              color={
                driftLevel === 'critical' ? '#991b1b' : driftLevel === 'high' ? '#334155' : '#0d9488'
              }
              fillColor={
                driftLevel === 'critical' ? 'rgba(153,27,27,0.1)' : 'rgba(13,148,136,0.08)'
              }
              startLabel={driftStart}
              endLabel={driftEnd}
            />
            {driftFactors && (
              <div className="mt-3 space-y-0.5">
                <Metric
                  label="Time ratio"
                  value={`${Math.round((driftFactors.timeRatio || 0) * 100)}%`}
                />
                <Metric
                  label="Late night bonus"
                  value={(driftFactors.lateNightBonus || 0) > 0 ? '+15%' : '--'}
                />
                <Metric
                  label="Productive discount"
                  value={
                    (driftFactors.productiveDiscount || 0) < 0
                      ? `${Math.round((driftFactors.productiveDiscount || 0) * 100)}%`
                      : '--'
                  }
                />
              </div>
            )}
          </div>

          {/* ═══ ROW 4: Top Channels + Content Sources ═══ */}
          <div className="col-span-3 bg-parchment rounded-xl p-5 rope-border">
            <Section>Top Channels (24h)</Section>
            {channels.length > 0 ? (
              <HBars
                items={channels.map((c) => ({
                  label: c.channel,
                  value: c.minutes,
                  sub: `${c.minutes}m / ${c.videoCount}v`,
                }))}
                max={maxChMin}
              />
            ) : (
              <div className="text-sm text-ink-light/50 italic captains-log py-6 text-center">
                No channel data yet
              </div>
            )}
          </div>

          <div className="col-span-3 bg-parchment rounded-xl p-5 rope-border">
            <Section>Content Sources (24h)</Section>
            {sources.length > 0 ? (
              <Donut
                segments={sources.map((s) => ({
                  value: s.count,
                  color: SRC_COLORS[s.source] || '#64748b',
                  label: s.source.replace('_', ' '),
                }))}
                center={
                  <span className="text-lg font-display font-bold text-ink">
                    {sources.reduce((s, x) => s + x.count, 0)}
                  </span>
                }
              />
            ) : (
              <div className="text-sm text-ink-light/50 italic captains-log py-6 text-center">
                No source data yet
              </div>
            )}
          </div>

          {/* ═══ ROW 5: Video Stats + Behavior + Sessions ═══ */}
          <div className="col-span-2 bg-parchment rounded-xl p-5 rope-border">
            <Section>Video Stats</Section>
            <Metric label="Total videos" value={today?.videoCount || 0} />
            <Metric label="Completed (>90%)" value={today?.videosCompleted || 0} />
            <Metric label="Abandoned (<30%)" value={today?.videosAbandoned || 0} />
            <Metric label="Shorts" value={today?.shortsCount || 0} />
            <Metric label="Unique channels" value={today?.uniqueChannels || 0} />
            {(today?.videoCount || 0) > 0 && (
              <div className="mt-3">
                <StackedSegments
                  segments={[
                    { value: today?.videosCompleted || 0, color: '#0d9488', label: 'Completed' },
                    {
                      value:
                        (today?.videoCount || 0) -
                        (today?.videosCompleted || 0) -
                        (today?.videosAbandoned || 0),
                      color: '#d4a574',
                      label: 'Partial',
                    },
                    { value: today?.videosAbandoned || 0, color: '#991b1b', label: 'Abandoned' },
                  ]}
                />
              </div>
            )}
          </div>

          <div className="col-span-2 bg-parchment rounded-xl p-5 rope-border">
            <Section>Behavioral Metrics</Section>
            <Metric
              label="Scroll distance"
              value={`${Math.round((today?.totalScrollPixels || 0) / 1000)}k`}
              sub="px"
            />
            <Metric
              label="Scroll velocity"
              value={today?.avgScrollVelocity ? Math.round(today.avgScrollVelocity) : 0}
              sub="px/s"
            />
            <Metric label="Thumbnails hovered" value={today?.thumbnailsHovered || 0} />
            <Metric label="Thumbnails clicked" value={today?.thumbnailsClicked || 0} />
            <Metric
              label="Click-through rate"
              value={
                today?.thumbnailsHovered
                  ? `${pct(today.thumbnailsClicked || 0, today.thumbnailsHovered)}%`
                  : '--'
              }
            />
            <Metric label="Tab switches" value={today?.tabSwitches || 0} />
            <Metric label="Page reloads" value={today?.pageReloads || 0} />
            <Metric label="Back button" value={today?.backButtonPresses || 0} />
          </div>

          <div className="col-span-2 bg-parchment rounded-xl p-5 rope-border">
            <Section>Session Analysis</Section>
            <Metric label="Sessions today" value={today?.sessionCount || 0} />
            <Metric
              label="Avg duration"
              value={
                today?.avgSessionDurationSeconds ? fmtSec(today.avgSessionDurationSeconds) : '--'
              }
            />
            <Metric label="Binge sessions (>1h)" value={today?.bingeSessions || 0} />
            <Metric
              label="Pre-sleep usage"
              value={today?.preSleepMinutes ? `${today.preSleepMinutes}m` : '0m'}
            />
            <Metric label="First YouTube check" value={today?.firstCheckTime || '--'} />
            <div className="mt-3 pt-2 border-t border-gold/20">
              <Metric label="Active time" value={fmt(todayActiveMin)} />
              <Metric label="Background time" value={fmt(todayBgMin)} />
              <Metric label="Total time" value={fmt(todayTotalMin)} />
            </div>
          </div>

          {/* ═══ ROW 6: Engagement + Interventions ═══ */}
          <div className="col-span-3 bg-parchment rounded-xl p-5 rope-border">
            <Section>Discovery & Engagement</Section>
            <Metric label="Search queries" value={today?.searchCount || 0} />
            <Metric label="Recommendation clicks" value={today?.recommendationClicks || 0} />
            <Metric label="Autoplay videos" value={today?.autoplayCount || 0} />
            <Metric label="Autoplay cancelled" value={today?.autoplayCancelled || 0} />
            {(today?.videoCount || 0) > 0 && (
              <div className="mt-4">
                <div className="text-[10px] text-ink-light font-display uppercase tracking-wider mb-2">
                  Engagement funnel
                </div>
                <div className="space-y-1.5">
                  {[
                    {
                      label: 'Thumbnails seen',
                      value: today?.thumbnailsHovered || 0,
                      color: '#e8d5b7',
                    },
                    { label: 'Clicked', value: today?.thumbnailsClicked || 0, color: '#d4a574' },
                    { label: 'Videos watched', value: today?.videoCount || 0, color: '#b8956a' },
                    { label: 'Completed', value: today?.videosCompleted || 0, color: '#0d9488' },
                  ].map((step, i) => {
                    const maxVal = today?.thumbnailsHovered || today?.videoCount || 1;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[10px] text-ink-light w-28 text-right">
                          {step.label}
                        </span>
                        <div className="flex-1 h-3 bg-parchment-dark/20 rounded overflow-hidden">
                          <div
                            className="h-full rounded transition-all"
                            style={{
                              width: `${maxVal > 0 ? (step.value / maxVal) * 100 : 0}%`,
                              background: step.color,
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-ink font-mono w-8 text-right">
                          {step.value}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="col-span-3 bg-parchment rounded-xl p-5 rope-border">
            <Section>Interventions & Prompts</Section>
            <Metric label="Prompts shown" value={today?.promptsShown || 0} />
            <Metric label="Prompts answered" value={today?.promptsAnswered || 0} />
            <Metric
              label="Answer rate"
              value={
                today?.promptsShown
                  ? `${pct(today.promptsAnswered || 0, today.promptsShown)}%`
                  : '--'
              }
            />
            <Metric label="Interventions shown" value={today?.interventionsShown || 0} />
            <Metric label="Interventions effective" value={today?.interventionsEffective || 0} />
            <Metric
              label="Effectiveness rate"
              value={
                today?.interventionsShown
                  ? `${pct(today.interventionsEffective || 0, today.interventionsShown)}%`
                  : '--'
              }
            />
            <div className="mt-4 pt-3 border-t border-gold/20">
              <Section>Achievements</Section>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold-dark to-gold flex items-center justify-center shadow">
                  <span className="text-navy font-display font-bold text-sm">
                    {achieveUnlocked}
                  </span>
                </div>
                <div>
                  <div className="text-sm font-display font-semibold text-ink">
                    {achieveUnlocked} / {achieveTotal}
                  </div>
                  <div className="text-[10px] text-ink-light">achievements unlocked</div>
                </div>
                <div className="ml-auto">
                  <div className="h-2 w-24 bg-parchment-dark/30 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-gold-dark to-gold"
                      style={{
                        width: `${achieveTotal > 0 ? (achieveUnlocked / achieveTotal) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ ROW 7: Active vs Background (full width) ═══ */}
          <div className="col-span-6 bg-parchment rounded-xl p-5 rope-border">
            <Section>Active vs Background Time (7 Days)</Section>
            <div className="flex items-end gap-3" style={{ height: 90 }}>
              {keys7.map((key, i) => {
                const active = weekActive[i];
                const bg = weekBg[i];
                const total = active + bg;
                const maxT = Math.max(
                  ...weekActive.map((a, j) => a + weekBg[j]),
                  1,
                );
                const barH = (total / maxT) * 100;
                const activeRatio = total > 0 ? (active / total) * 100 : 100;
                const isToday = key === tk;

                return (
                  <div key={key} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full rounded-t overflow-hidden"
                      style={{
                        height: `${Math.max(barH, total > 0 ? 4 : 0)}%`,
                        background: `linear-gradient(to top, rgba(13,148,136,${isToday ? 0.85 : 0.55}) ${activeRatio}%, rgba(51,65,85,0.3) ${activeRatio}%)`,
                      }}
                      title={`Active: ${active}m / BG: ${bg}m`}
                    />
                    <div className="text-center mt-1">
                      <span
                        className={`text-[10px] block ${isToday ? 'text-gold-dark font-bold' : 'text-ink-light/60'}`}
                      >
                        {weekLabels[i]}
                      </span>
                      <span className="text-[8px] text-ink-light/50 font-mono">
                        {active}+{bg}m
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-2 justify-center">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded" style={{ background: 'rgba(13,148,136,0.7)' }} />
                <span className="text-[10px] text-ink-light">Active</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded" style={{ background: 'rgba(51,65,85,0.3)' }} />
                <span className="text-[10px] text-ink-light">Background</span>
              </div>
            </div>
          </div>

          {/* ═══ ROW 8: Weekly Summary + Level ═══ */}
          <div className="col-span-3 bg-parchment rounded-xl p-5 rope-border">
            <Section>Weekly Summary</Section>
            <Metric label="Total active time" value={fmt(weekTotals.activeMin)} />
            <Metric label="Average daily" value={fmt(weekTotals.avgDailyMin)} />
            <Metric label="Total videos" value={weekTotals.videos} />
            <Metric label="Total sessions" value={weekTotals.sessions} />
            <Metric label="Productive videos" value={weekTotals.productive} />
            <Metric label="Unproductive videos" value={weekTotals.unproductive} />
            <Metric label="Total shorts" value={weekTotals.shorts} />
            <Metric label="Binge sessions" value={weekTotals.binge} />
            <Metric label="Searches" value={weekTotals.search} />
            <Metric label="Rec. clicks" value={weekTotals.recClicks} />
            <Metric label="Autoplay" value={weekTotals.autoplay} />
          </div>

          <div className="col-span-3 bg-parchment rounded-xl p-5 rope-border">
            <Section>Level & Progress</Section>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gold-dark to-gold flex items-center justify-center shadow-lg">
                <span className="text-2xl font-display font-bold text-navy">{level}</span>
              </div>
              <div>
                <div className="text-lg font-display font-semibold text-ink">{rank}</div>
                <div className="text-sm text-ink-light font-body">{xp} total XP</div>
              </div>
            </div>
            <div className="mb-4">
              <div className="flex justify-between text-[10px] text-ink-light mb-1">
                <span>Level {level}</span>
                <span>{xpInLevel}/100 XP</span>
                <span>Level {level + 1}</span>
              </div>
              <div className="h-3 bg-parchment-dark/30 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-gold-dark via-gold to-gold-dark transition-all"
                  style={{ width: `${xpInLevel}%` }}
                />
              </div>
            </div>
            <div className="pt-3 border-t border-gold/20">
              <Metric label="Challenge tier" value={tier} />
            </div>

            {/* Shorts vs Long-form */}
            {(today?.videoCount || 0) > 0 && (
              <div className="mt-4 pt-3 border-t border-gold/20">
                <div className="text-[10px] text-ink-light font-display uppercase tracking-wider mb-2">
                  Shorts vs Long-form
                </div>
                <StackedSegments
                  segments={[
                    {
                      value: (today?.videoCount || 0) - (today?.shortsCount || 0),
                      color: '#0d9488',
                      label: 'Long-form',
                    },
                    { value: today?.shortsCount || 0, color: '#991b1b', label: 'Shorts' },
                  ]}
                />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
