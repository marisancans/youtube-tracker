import { useState, useEffect, useCallback } from 'react';
import {
  getCurrentSession,
  getCurrentVideoSession,
  getCurrentVideoInfo,
  getTemporalData,
  rateVideo,
} from '../../content/tracker';
import { safeSendMessageWithCallback, safeSendMessage } from '../../lib/messaging';
import { showFrictionOverlay, isFrictionOverlayVisible } from '../../content/friction-overlay';

interface Nudge {
  id: string;
  type: 'time_warning' | 'break_reminder' | 'goal_reached' | 'bedtime' | 'tip';
  message: string;
  icon: string;
  color: string;
  dismissible: boolean;
  action?: { label: string; callback: () => void };
}

interface DriftData {
  drift: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  effects: {
    thumbnailBlur: number;
    thumbnailGrayscale: number;
    commentsReduction: number;
    sidebarReduction: number;
    autoplayDelay: number;
    showTextOnly: boolean;
  };
}

type ChallengeTier = 'casual' | 'focused' | 'disciplined' | 'monk' | 'ascetic';

interface ChallengeProgress {
  currentTier: ChallengeTier;
  daysUnderGoal: number;
  eligibleForUpgrade: boolean;
}

const TIER_CONFIG: Record<ChallengeTier, { icon: string; label: string; nextLabel?: string }> = {
  casual: { icon: '🌱', label: 'Casual', nextLabel: 'Focused' },
  focused: { icon: '🎯', label: 'Focused', nextLabel: 'Disciplined' },
  disciplined: { icon: '⚡', label: 'Disciplined', nextLabel: 'Monk' },
  monk: { icon: '🔥', label: 'Monk', nextLabel: 'Ascetic' },
  ascetic: { icon: '💎', label: 'Ascetic' },
};

const TIER_ORDER: ChallengeTier[] = ['casual', 'focused', 'disciplined', 'monk', 'ascetic'];

interface ProductiveUrl {
  id: string;
  url: string;
  title: string;
  addedAt: number;
}

interface WidgetState {
  collapsed: boolean;
  minimized: boolean;
  sessionDuration: number;
  videosWatched: number;
  todayMinutes: number;
  dailyGoal: number;
  showPrompt: boolean;
  videoTitle: string | null;
  lastRatedVideo: string | null;
  productiveCount: number;
  unproductiveCount: number;
  currentVideoSeconds: number;
  streak: number;
  hourlyData: number[];
  level: number;
  xp: number;
  achievements: string[];
  youtubeTabs: number;
  // Nudges
  activeNudge: Nudge | null;
  lastBreakReminder: number;
  dismissedNudges: Set<string>;
  phase: 'observation' | 'awareness' | 'intervention' | 'reduction';
  // Drift
  drift: DriftData;
  // Challenge
  challengeProgress: ChallengeProgress | null;
  showUpgradePrompt: boolean;
  // Productive alternatives
  productiveUrls: ProductiveUrl[];
  suggestedUrl: ProductiveUrl | null;
  dismissedSuggestion: boolean;
  // Background time
  todayBackgroundMinutes: number;
  sessionBackgroundSeconds: number;
  // Sync status
  lastSyncTime: number | null;
  showSyncStatus: boolean;
  syncEnabled: boolean;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatMinutes(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

// Calculate focus score (0-100)
function calculateFocusScore(productive: number, unproductive: number, todayMinutes: number, goal: number): number {
  if (productive + unproductive === 0) return 100;
  const productivityRatio = productive / (productive + unproductive);
  const timeScore = todayMinutes <= goal ? 100 : Math.max(0, 100 - ((todayMinutes - goal) / goal) * 50);
  return Math.round((productivityRatio * 60) + (timeScore * 0.4));
}

// Get level from XP
function getLevelInfo(xp: number): { level: number; currentXp: number; nextLevelXp: number; progress: number } {
  const levels = [0, 100, 250, 500, 1000, 2000, 4000, 8000, 15000, 30000];
  let level = 1;
  for (let i = 0; i < levels.length - 1; i++) {
    if (xp >= levels[i]) level = i + 1;
  }
  const currentLevelXp = levels[level - 1] || 0;
  const nextLevelXp = levels[level] || levels[levels.length - 1];
  const progress = ((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100;
  return { level, currentXp: xp - currentLevelXp, nextLevelXp: nextLevelXp - currentLevelXp, progress };
}

// Compute 24h hourly data by merging stored DailyStats + live temporal data
function compute24hData(
  storedHourly: Record<string, number> | undefined,
  liveHourly: Record<string, number>,
): number[] {
  const data: number[] = new Array(24).fill(0);
  if (storedHourly) {
    for (const [hour, seconds] of Object.entries(storedHourly)) {
      const h = parseInt(hour, 10);
      if (h >= 0 && h < 24) data[h] += seconds;
    }
  }
  for (const [hour, seconds] of Object.entries(liveHourly)) {
    const h = parseInt(hour, 10);
    if (h >= 0 && h < 24) data[h] += seconds;
  }
  return data.map(s => Math.round(s / 60));
}

// Icons as SVG components
const Icons = {
  Clock: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
  Video: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m10 9 5 3-5 3V9z"/></svg>,
  ThumbsUp: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/></svg>,
  ThumbsDown: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z"/></svg>,
  Minus: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/></svg>,
  ChevronUp: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6"/></svg>,
  ChevronDown: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>,
  Target: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  Flame: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>,
  Zap: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  Trophy: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>,
  Star: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  TrendingUp: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  TrendingDown: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>,
  Award: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>,
  Brain: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3 4 4.5 4.5 0 0 1-3-4"/><path d="M12 9v4"/><path d="M12 6v.01"/></svg>,
  Layers: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/></svg>,
  Waves: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>,
  AlertCircle: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Coffee: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>,
  Moon: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>,
  X: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Lightbulb: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>,
  ExternalLink: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
  Sparkles: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>,
  Cloud: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>,
  CloudOff: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m2 2 20 20"/><path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193"/><path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07"/></svg>,
  Check: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
};

// 24h day cycle bar chart
function DayCycleChart({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const currentHour = new Date().getHours();
  const labels = [
    { hour: 0, text: '12a' },
    { hour: 6, text: '6a' },
    { hour: 12, text: '12p' },
    { hour: 18, text: '6p' },
  ];

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', height: '36px', gap: '1px' }}>
        {data.map((minutes, hour) => (
          <div
            key={hour}
            title={`${hour}:00 — ${minutes}m`}
            style={{
              flex: 1,
              minHeight: minutes > 0 ? '3px' : '1px',
              height: `${Math.max(minutes > 0 ? 8 : 3, (minutes / max) * 100)}%`,
              background: hour === currentHour
                ? '#3b82f6'
                : minutes > 0
                ? 'rgba(74, 222, 128, 0.5)'
                : 'rgba(255,255,255,0.06)',
              borderRadius: '1.5px 1.5px 0 0',
              transition: 'height 0.5s ease',
            }}
          />
        ))}
      </div>
      <div style={{ position: 'relative', height: '12px', marginTop: '2px' }}>
        {labels.map(({ hour, text }) => (
          <span
            key={hour}
            style={{
              position: 'absolute',
              left: `${(hour / 24) * 100}%`,
              fontSize: '8px',
              color: 'rgba(255,255,255,0.3)',
              transform: hour === 0 ? 'none' : 'translateX(-50%)',
            }}
          >
            {text}
          </span>
        ))}
        <span style={{
          position: 'absolute',
          right: 0,
          fontSize: '8px',
          color: 'rgba(255,255,255,0.3)',
        }}>
          12a
        </span>
      </div>
    </div>
  );
}

// Focus score ring
function FocusRing({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 28;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? '#4ade80' : score >= 50 ? '#fbbf24' : '#f87171';
  
  return (
    <div style={{ position: 'relative', width: '72px', height: '72px' }}>
      <svg width="72" height="72" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="36" cy="36" r="28" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
        <circle 
          cx="36" cy="36" r="28" fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '18px', fontWeight: '700', color }}>{score}</div>
        <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Focus</div>
      </div>
    </div>
  );
}

// Keyframes for animations (injected via style element)
const animationStyles = `
  @keyframes yt-detox-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  @keyframes yt-detox-wave {
    0% { transform: translateX(0); }
    50% { transform: translateX(3px); }
    100% { transform: translateX(0); }
  }
  @keyframes yt-detox-shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-2px); }
    75% { transform: translateX(2px); }
  }
  @keyframes yt-detox-glow {
    0%, 100% { box-shadow: 0 0 5px rgba(239, 68, 68, 0.3); }
    50% { box-shadow: 0 0 15px rgba(239, 68, 68, 0.5); }
  }
`;

const s = {
  container: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', fontSize: '14px', color: '#fff' },
  pill: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(8px)', borderRadius: '9999px', fontSize: '13px', fontWeight: '500', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)', cursor: 'pointer', transition: 'transform 0.2s ease, box-shadow 0.2s ease' },
  nudge: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', marginBottom: '12px', position: 'relative' as const, animation: 'yt-detox-shake 0.3s ease' },
  nudgeIcon: { flexShrink: 0 },
  nudgeText: { flex: 1, fontSize: '12px', lineHeight: '1.3' },
  nudgeClose: { position: 'absolute' as const, top: '4px', right: '4px', background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '2px', transition: 'color 0.2s ease' },
  card: { background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.97) 0%, rgba(30, 41, 59, 0.97) 100%)', backdropFilter: 'blur(16px)', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.1)', overflow: 'hidden', width: '100%', transition: 'transform 0.2s ease, box-shadow 0.2s ease' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '8px' },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' },
  headerTitle: { fontSize: '13px', fontWeight: '600', color: 'rgba(255, 255, 255, 0.9)' },
  headerButtons: { display: 'flex', gap: '4px' },
  iconBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', background: 'transparent', border: 'none', borderRadius: '8px', color: 'rgba(255, 255, 255, 0.6)', cursor: 'pointer' },
  body: { padding: '16px' },
  heroRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' },
  timerSection: { flex: 1 },
  timerValue: { fontSize: '32px', fontWeight: '700', color: '#fff', fontVariantNumeric: 'tabular-nums', letterSpacing: '-1px' },
  timerLabel: { fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase' as const, letterSpacing: '1px' },
  streakBadge: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', padding: '8px 12px', background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(245, 158, 11, 0.2) 100%)', borderRadius: '12px', border: '1px solid rgba(251, 191, 36, 0.3)' },
  streakNumber: { fontSize: '20px', fontWeight: '700', color: '#fbbf24' },
  streakLabel: { fontSize: '9px', color: 'rgba(251, 191, 36, 0.8)', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '16px' },
  statCard: { padding: '10px 6px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '10px', textAlign: 'center' as const },
  statIcon: { display: 'flex', justifyContent: 'center', marginBottom: '4px' },
  statValue: { fontSize: '18px', fontWeight: '700', color: '#fff' },
  statLabel: { fontSize: '8px', color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  levelBar: { marginBottom: '16px', padding: '12px', background: 'linear-gradient(135deg, rgba(147, 51, 234, 0.15) 0%, rgba(79, 70, 229, 0.15) 100%)', borderRadius: '12px', border: '1px solid rgba(147, 51, 234, 0.2)' },
  levelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  levelInfo: { display: 'flex', alignItems: 'center', gap: '8px' },
  levelBadge: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)', borderRadius: '8px', fontSize: '14px', fontWeight: '700' },
  levelText: { fontSize: '12px', color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  levelXp: { fontSize: '10px', color: 'rgba(255,255,255,0.5)' },
  levelProgress: { height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' },
  levelFill: { height: '100%', background: 'linear-gradient(90deg, #a855f7 0%, #6366f1 100%)', borderRadius: '3px', transition: 'width 0.5s' },
  weeklySection: { marginBottom: '16px', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' },
  weeklyHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  weeklyTitle: { fontSize: '11px', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: '6px' },
  weeklyTrend: { fontSize: '10px', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '4px' },
  progressSection: { marginBottom: '16px' },
  progressHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  progressLabel: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)' },
  progressValue: { fontSize: '11px', fontWeight: '500' },
  progressBar: { height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: '4px', transition: 'width 0.5s ease' },
  overLimit: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '11px', color: '#f87171', marginTop: '8px' },
  achievementRow: { display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' as const },
  achievementBadge: { display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '10px', color: 'rgba(255,255,255,0.7)' },
  nowWatching: { marginBottom: '12px', padding: '10px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '10px' },
  nowWatchingHeader: { display: 'flex', alignItems: 'flex-start', gap: '8px' },
  nowWatchingLabel: { fontSize: '9px', color: 'rgba(255, 255, 255, 0.5)' },
  nowWatchingTitle: { fontSize: '12px', color: 'rgba(255, 255, 255, 0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  nowWatchingTime: { fontSize: '10px', color: 'rgba(255, 255, 255, 0.4)', marginTop: '2px' },
  prompt: { padding: '12px', background: 'linear-gradient(135deg, rgba(147, 51, 234, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)', borderRadius: '12px', border: '1px solid rgba(147, 51, 234, 0.3)' },
  promptText: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.9)', marginBottom: '10px' },
  ratingBtns: { display: 'flex', gap: '6px' },
  ratingBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '8px 4px', border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: '500', cursor: 'pointer' },
};

export default function Widget(): JSX.Element {
  const [state, setState] = useState<WidgetState>({
    collapsed: false, minimized: false, sessionDuration: 0, videosWatched: 0, todayMinutes: 0,
    dailyGoal: 60, showPrompt: false, videoTitle: null, lastRatedVideo: null,
    productiveCount: 0, unproductiveCount: 0, currentVideoSeconds: 0,
    streak: 0, hourlyData: new Array(24).fill(0), level: 1, xp: 0,
    achievements: [],
    youtubeTabs: 1,
    activeNudge: null,
    lastBreakReminder: 0,
    dismissedNudges: new Set(),
    phase: 'observation',
    drift: {
      drift: 0,
      level: 'low',
      effects: {
        thumbnailBlur: 0,
        thumbnailGrayscale: 0,
        commentsReduction: 0,
        sidebarReduction: 0,
        autoplayDelay: 5,
        showTextOnly: false,
      },
    },
    challengeProgress: null,
    showUpgradePrompt: false,
    productiveUrls: [],
    suggestedUrl: null,
    dismissedSuggestion: false,
    todayBackgroundMinutes: 0,
    sessionBackgroundSeconds: 0,
    lastSyncTime: null,
    showSyncStatus: false,
    syncEnabled: false,
  });
  
  // Inject animation styles once
  useEffect(() => {
    const styleId = 'yt-detox-widget-animations';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = animationStyles;
      document.head.appendChild(style);
    }
  }, []);
  
  useEffect(() => {
    safeSendMessageWithCallback('GET_SETTINGS', undefined, (response: any) => {
      if (response && !response.error) {
        setState(p => ({ ...p, dailyGoal: response.dailyGoalMinutes || 60 }));
      }
    });
    // Load streak from background (calculated properly)
    safeSendMessageWithCallback('GET_STREAK', undefined, (response: any) => {
      if (response?.streak !== undefined) {
        setState(p => ({ ...p, streak: response.streak }));
      }
    });
    // Load xp, dailyStats, phase, productiveUrls, and sync status from storage
    if (!chrome.storage?.local) return;
    chrome.storage.local.get(['xp', 'dailyStats', 'settings', 'productiveUrls', 'syncState'], (result) => {
      const today = new Date().toISOString().split('T')[0];
      const storedHourly = result.dailyStats?.[today]?.hourlySeconds;
      const liveHourly = getTemporalData().hourlySeconds;
      setState(p => ({
        ...p,
        xp: result.xp || p.xp,
        hourlyData: compute24hData(storedHourly, liveHourly),
        phase: result.settings?.phase || p.phase,
        productiveUrls: result.productiveUrls || p.productiveUrls,
        lastSyncTime: result.syncState?.lastSyncTime || p.lastSyncTime,
        syncEnabled: result.settings?.backend?.enabled || false,
      }));
    });
    // Load achievements
    safeSendMessageWithCallback('GET_ACHIEVEMENTS', undefined, (response: any) => {
      if (response?.unlocked) {
        setState(p => ({
          ...p,
          achievements: response.unlocked.map((a: any) => `${a.icon} ${a.name}`),
        }));
      }
    });
    // Load drift
    safeSendMessageWithCallback('GET_DRIFT', undefined, (response: any) => {
      if (response && typeof response.drift === 'number') {
        setState(p => ({
          ...p,
          drift: {
            drift: response.drift,
            level: response.level,
            effects: response.effects,
          }
        }));
      }
    });
  }, []);
  
  // Periodically update drift and streak
  useEffect(() => {
    const updateInterval = setInterval(() => {
      // Update drift
      safeSendMessageWithCallback('GET_DRIFT', undefined, (response: any) => {
        if (response && typeof response.drift === 'number') {
          setState(p => {
            const newLevel = response.level;
            const wasLow = p.drift.level === 'low';
            const nowDrifting = newLevel !== 'low';

            // Suggest a productive URL when transitioning to drifting state
            let suggestedUrl = p.suggestedUrl;
            if (wasLow && nowDrifting && p.productiveUrls.length > 0 && !p.dismissedSuggestion) {
              const randomIdx = Math.floor(Math.random() * p.productiveUrls.length);
              suggestedUrl = p.productiveUrls[randomIdx];
            }

            return {
              ...p,
              drift: {
                drift: response.drift,
                level: response.level,
                effects: response.effects,
              },
              suggestedUrl,
            };
          });
        }
      });
      // Update XP, productive URLs, and sync state
      if (!chrome.storage?.local) return;
      chrome.storage.local.get(['xp', 'productiveUrls', 'syncState', 'settings'], (result) => {
        setState(p => ({
          ...p,
          xp: result.xp !== undefined ? result.xp : p.xp,
          productiveUrls: result.productiveUrls || p.productiveUrls,
          lastSyncTime: result.syncState?.lastSyncTime || p.lastSyncTime,
          syncEnabled: result.settings?.backend?.enabled !== undefined ? result.settings.backend.enabled : p.syncEnabled,
        }));
      });
    }, 10000); // Update every 10 seconds
    return () => clearInterval(updateInterval);
  }, []);

  // Update 24h chart every 60 seconds
  useEffect(() => {
    const update24h = () => {
      if (!chrome.storage?.local) return;
      chrome.storage.local.get(['dailyStats'], (result) => {
        const today = new Date().toISOString().split('T')[0];
        const storedHourly = result.dailyStats?.[today]?.hourlySeconds;
        const liveHourly = getTemporalData().hourlySeconds;
        setState(p => ({ ...p, hourlyData: compute24hData(storedHourly, liveHourly) }));
      });
    };
    update24h();
    const interval = setInterval(update24h, 60000);
    return () => clearInterval(interval);
  }, []);
  
  // Fetch challenge progress periodically
  useEffect(() => {
    const fetchChallengeProgress = () => {
      safeSendMessageWithCallback('GET_CHALLENGE_PROGRESS', undefined, (response: any) => {
        if (response && response.currentTier) {
          setState(p => ({
            ...p,
            challengeProgress: {
              currentTier: response.currentTier,
              daysUnderGoal: response.daysUnderGoal,
              eligibleForUpgrade: response.eligibleForUpgrade,
            },
            // Show upgrade prompt if eligible and not dismissed
            showUpgradePrompt: response.eligibleForUpgrade && !p.dismissedNudges.has('upgrade_prompt'),
          }));
        }
      });
    };
    
    // Initial fetch
    fetchChallengeProgress();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchChallengeProgress, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);
  
  // Handle tier upgrade
  const handleUpgradeTier = useCallback(() => {
    safeSendMessageWithCallback('UPGRADE_TIER', undefined, (response: any) => {
      if (response?.success) {
        setState(p => ({
          ...p,
          showUpgradePrompt: false,
          challengeProgress: p.challengeProgress ? {
            ...p.challengeProgress,
            currentTier: response.newTier,
            eligibleForUpgrade: false,
            daysUnderGoal: 0,
          } : null,
          xp: p.xp + (response.xpBonus || 0),
        }));
      }
    });
  }, []);
  
  const dismissUpgradePrompt = useCallback(() => {
    setState(p => ({
      ...p,
      showUpgradePrompt: false,
      dismissedNudges: new Set([...p.dismissedNudges, 'upgrade_prompt']),
    }));
  }, []);
  
  const dismissSuggestion = useCallback(() => {
    setState(p => ({
      ...p,
      suggestedUrl: null,
      dismissedSuggestion: true,
    }));
  }, []);
  
  const openSuggestion = useCallback((url: string) => {
    window.open(url, '_blank');
    setState(p => ({
      ...p,
      suggestedUrl: null,
      dismissedSuggestion: true,
    }));
  }, []);
  
  // Nudge logic - check for nudges every update
  const checkNudges = useCallback(() => {
    // Gated by dev switch
    const devFeatures = (window as any).__YT_DETOX_DEV_FEATURES__ || {};
    if (!devFeatures.nudges) return;
    // Don't show nudges during observation phase
    if (state.phase === 'observation') return;
    
    const now = Date.now();
    
    // Time warning: over daily goal
    if (state.todayMinutes > state.dailyGoal && !state.dismissedNudges.has('time_warning_today')) {
      const overBy = state.todayMinutes - state.dailyGoal;
      setState(p => ({
        ...p,
        activeNudge: {
          id: 'time_warning_today',
          type: 'time_warning',
          message: `You're ${formatMinutes(overBy)} over your daily goal`,
          icon: 'AlertCircle',
          color: '#f87171',
          dismissible: true,
        },
      }));
      return;
    }
    
    // Break reminder: every 30 minutes of continuous session
    const breakInterval = 30 * 60; // 30 minutes in seconds
    if (
      state.sessionDuration > 0 && 
      state.sessionDuration % breakInterval < 60 && // Within first minute of the interval
      now - state.lastBreakReminder > breakInterval * 1000 &&
      !state.dismissedNudges.has(`break_${Math.floor(state.sessionDuration / breakInterval)}`)
    ) {
      setState(p => ({
        ...p,
        lastBreakReminder: now,
        activeNudge: {
          id: `break_${Math.floor(state.sessionDuration / breakInterval)}`,
          type: 'break_reminder',
          message: `${formatMinutes(Math.floor(state.sessionDuration / 60))} session — time for a quick break?`,
          icon: 'Coffee',
          color: '#60a5fa',
          dismissible: true,
        },
      }));
      return;
    }
    
    // Bedtime warning (check if after 23:00)
    const hour = new Date().getHours();
    if (hour >= 23 && !state.dismissedNudges.has('bedtime_warning')) {
      setState(p => ({
        ...p,
        activeNudge: {
          id: 'bedtime_warning',
          type: 'bedtime',
          message: 'Getting late — screens before bed affect sleep quality',
          icon: 'Moon',
          color: '#a78bfa',
          dismissible: true,
        },
      }));
      return;
    }
  }, [state.todayMinutes, state.dailyGoal, state.sessionDuration, state.dismissedNudges, state.phase, state.lastBreakReminder]);
  
  // Run nudge check periodically
  useEffect(() => {
    const nudgeInterval = setInterval(checkNudges, 10000); // Check every 10 seconds
    return () => clearInterval(nudgeInterval);
  }, [checkNudges]);
  
  const dismissNudge = useCallback((nudgeId: string) => {
    setState(p => ({
      ...p,
      activeNudge: null,
      dismissedNudges: new Set([...p.dismissedNudges, nudgeId]),
    }));
  }, []);
  
  useEffect(() => {
    const updateStats = () => {
      const browserSession = getCurrentSession();
      const videoSession = getCurrentVideoSession();
      const videoInfo = getCurrentVideoInfo();
      
      if (browserSession) {
        setState(p => ({
          ...p, sessionDuration: browserSession.playDurationSeconds,
          videosWatched: browserSession.videosWatched,
          productiveCount: browserSession.productiveVideos,
          unproductiveCount: browserSession.unproductiveVideos,
          sessionBackgroundSeconds: browserSession.backgroundSeconds || 0,
        }));
      }
      if (videoSession) setState(p => ({ ...p, currentVideoSeconds: videoSession.watchedSeconds }));
      if (videoInfo) setState(p => ({ ...p, videoTitle: videoInfo.title || null }));
      
      safeSendMessageWithCallback('GET_STATS', undefined, (response: any) => {
        if (response?.today) setState(p => ({
          ...p,
          todayMinutes: Math.floor((response.today.activeSeconds || response.today.totalSeconds) / 60),
          todayBackgroundMinutes: Math.floor((response.today.backgroundSeconds || 0) / 60),
        }));
      });

      // Get tab count
      safeSendMessageWithCallback('GET_TAB_INFO', undefined, (response: any) => {
        if (response?.youtubeTabs !== undefined) {
          setState(p => ({ ...p, youtubeTabs: response.youtubeTabs }));
        }
      });
      
      const devFeatures = (window as any).__YT_DETOX_DEV_FEATURES__ || {};
      if (devFeatures.frictionOverlay && videoSession && !videoSession.productivityRating && state.lastRatedVideo !== videoSession.id) {
        // Trigger drift rating after 30s of watching or at 80% progress
        const shouldPrompt = videoSession.watchedSeconds > 30 || videoSession.watchedPercent >= 80;
        if (shouldPrompt && !state.showPrompt && !isFrictionOverlayVisible()) {
          setState(p => ({ ...p, showPrompt: true }));
          safeSendMessage('PROMPT_SHOWN');
          const title = videoInfo?.title || videoSession.title || 'this video';
          showFrictionOverlay(title).then((driftRating) => {
            // Map 1-5 drift scale to -1/0/1 for storage compatibility
            // 1-2 (Anchored/Steady) = productive (1)
            // 3 (Drifting) = neutral (0)
            // 4-5 (Adrift/Lost) = unproductive (-1)
            const storageRating: -1 | 0 | 1 = driftRating <= 2 ? 1 : driftRating === 3 ? 0 : -1;
            rateVideo(storageRating);
            const xpGain = storageRating === 1 ? 15 : storageRating === 0 ? 5 : 2;
            setState(p => ({ ...p, showPrompt: false, lastRatedVideo: videoSession.id, xp: p.xp + xpGain }));
          });
        }
      }
    };
    updateStats();
    const interval = setInterval(updateStats, 1000);
    return () => clearInterval(interval);
  }, [state.lastRatedVideo, state.showPrompt]);
  
  const progressPercent = Math.min((state.todayMinutes / state.dailyGoal) * 100, 100);
  const isOverGoal = progressPercent >= 100;
  const isNearGoal = progressPercent >= 80;
  const focusScore = calculateFocusScore(state.productiveCount, state.unproductiveCount, state.todayMinutes, state.dailyGoal);
  const levelInfo = getLevelInfo(state.xp);
  
  const getProgressColor = () => {
    if (isOverGoal) return 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)';
    if (isNearGoal) return 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)';
    return 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)';
  };
  
  const getProgressTextColor = () => isOverGoal ? '#f87171' : isNearGoal ? '#fbbf24' : 'rgba(255,255,255,0.7)';
  
  // Minimized pill
  if (state.minimized) {
    return (
      <div style={s.container}>
        <div style={s.pill} onClick={() => setState(p => ({ ...p, minimized: false }))}>
          <Icons.Clock />
          <span>{formatTime(state.sessionDuration)}</span>
          <span style={{ width: '1px', height: '12px', background: 'rgba(255,255,255,0.3)' }} />
          {state.streak > 0 && <span style={{ color: '#fbbf24' }}>🔥{state.streak}</span>}
          <span style={{ color: isOverGoal ? '#f87171' : 'rgba(255,255,255,0.7)' }}>{formatMinutes(state.todayMinutes)}</span>
        </div>
      </div>
    );
  }
  
  return (
    <div style={s.container}>
      <div style={s.card}>
        {/* Header */}
        <div style={s.header}>
          <div 
            style={{ ...s.headerLeft, cursor: 'pointer' }}
            onClick={() => setState(p => ({ ...p, showSyncStatus: !p.showSyncStatus }))}
            title="Click to see sync status"
          >
            <div style={s.statusDot} />
            <span style={s.headerTitle}>YouTube Detox</span>
            {state.syncEnabled && (
              <span style={{ marginLeft: '4px', opacity: 0.5 }}>
                {state.lastSyncTime ? <Icons.Cloud /> : <Icons.CloudOff />}
              </span>
            )}
          </div>
          <div style={s.headerButtons}>
            <button style={s.iconBtn} onClick={() => setState(p => ({ ...p, minimized: true }))}><Icons.Minus /></button>
            <button style={s.iconBtn} onClick={() => setState(p => ({ ...p, collapsed: !p.collapsed }))}>
              {state.collapsed ? <Icons.ChevronDown /> : <Icons.ChevronUp />}
            </button>
          </div>
        </div>
        
        {/* Sync Status Popup */}
        {state.showSyncStatus && (
          <div style={{
            padding: '10px 16px',
            background: 'rgba(0,0,0,0.3)',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            fontSize: '11px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>Cloud Sync</span>
              {state.syncEnabled ? (
                <span style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Icons.Check /> Enabled
                </span>
              ) : (
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>Disabled</span>
              )}
            </div>
            {state.syncEnabled && state.lastSyncTime && (
              <div style={{ marginTop: '6px', color: 'rgba(255,255,255,0.5)' }}>
                Last synced: {(() => {
                  const diff = Date.now() - state.lastSyncTime;
                  if (diff < 60000) return 'Just now';
                  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
                  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
                  return new Date(state.lastSyncTime).toLocaleDateString();
                })()}
              </div>
            )}
            {state.syncEnabled && !state.lastSyncTime && (
              <div style={{ marginTop: '6px', color: 'rgba(255,255,255,0.4)' }}>
                Not synced yet — sign in to sync
              </div>
            )}
          </div>
        )}
        
        {!state.collapsed && (
          <div style={s.body}>
            {/* Hero Row: Timer + Focus Score */}
            <div style={s.heroRow}>
              <div style={s.timerSection}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <div style={s.timerValue}>{formatTime(state.sessionDuration)}</div>
                  {state.sessionBackgroundSeconds >= 60 && (
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontWeight: '400' }}>
                      +{Math.floor(state.sessionBackgroundSeconds / 60)}m bg
                    </span>
                  )}
                </div>
                <div style={s.timerLabel}>Watch Time</div>
              </div>
              <FocusRing score={focusScore} />
              {state.streak > 0 && (
                <div style={s.streakBadge}>
                  <div style={s.streakNumber}>🔥 {state.streak}</div>
                  <div style={s.streakLabel}>Day Streak</div>
                </div>
              )}
            </div>
            
            {/* Active Nudge */}
            {state.activeNudge && (
              <div style={{
                ...s.nudge,
                background: `linear-gradient(135deg, ${state.activeNudge.color}20 0%, ${state.activeNudge.color}10 100%)`,
                border: `1px solid ${state.activeNudge.color}40`,
              }}>
                <div style={{ ...s.nudgeIcon, color: state.activeNudge.color }}>
                  {state.activeNudge.icon === 'AlertCircle' && <Icons.AlertCircle />}
                  {state.activeNudge.icon === 'Coffee' && <Icons.Coffee />}
                  {state.activeNudge.icon === 'Moon' && <Icons.Moon />}
                  {state.activeNudge.icon === 'Lightbulb' && <Icons.Lightbulb />}
                </div>
                <div style={s.nudgeText}>{state.activeNudge.message}</div>
                {state.activeNudge.dismissible && (
                  <button 
                    style={s.nudgeClose} 
                    onClick={() => dismissNudge(state.activeNudge!.id)}
                  >
                    <Icons.X />
                  </button>
                )}
              </div>
            )}
            
            {/* Tier Upgrade Prompt */}
            {state.showUpgradePrompt && state.challengeProgress && (
              <div style={{
                padding: '12px',
                background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(79, 70, 229, 0.15) 100%)',
                borderRadius: '12px',
                marginBottom: '12px',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                animation: 'yt-detox-pulse 2s ease-in-out infinite',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '24px' }}>🏆</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#a78bfa' }}>
                      Challenge Unlocked!
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>
                      {state.challengeProgress.daysUnderGoal} days under goal — ready for the next level?
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ 
                    padding: '6px 12px', 
                    background: 'rgba(255,255,255,0.1)', 
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}>
                    {TIER_CONFIG[state.challengeProgress.currentTier]?.icon} {TIER_CONFIG[state.challengeProgress.currentTier]?.label}
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>→</span>
                  <div style={{ 
                    padding: '6px 12px', 
                    background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.3) 0%, rgba(79, 70, 229, 0.3) 100%)', 
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    border: '1px solid rgba(168, 85, 247, 0.5)',
                  }}>
                    {(() => {
                      const nextIndex = TIER_ORDER.indexOf(state.challengeProgress.currentTier) + 1;
                      const nextTier = TIER_ORDER[nextIndex];
                      return nextTier ? `${TIER_CONFIG[nextTier]?.icon} ${TIER_CONFIG[nextTier]?.label}` : '💎 Max';
                    })()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleUpgradeTier}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Accept Challenge +100 XP
                  </button>
                  <button
                    onClick={dismissUpgradePrompt}
                    style={{
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.1)',
                      border: 'none',
                      borderRadius: '8px',
                      color: 'rgba(255,255,255,0.6)',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Later
                  </button>
                </div>
              </div>
            )}
            
            {/* Level Progress */}
            <div style={s.levelBar}>
              <div style={s.levelHeader}>
                <div style={s.levelInfo}>
                  <div style={s.levelBadge}>{levelInfo.level}</div>
                  <div>
                    <div style={s.levelText}>Level {levelInfo.level}</div>
                    <div style={s.levelXp}>{levelInfo.currentXp} / {levelInfo.nextLevelXp} XP</div>
                  </div>
                </div>
                <Icons.Trophy />
              </div>
              <div style={s.levelProgress}>
                <div style={{ ...s.levelFill, width: `${levelInfo.progress}%` }} />
              </div>
            </div>
            
            {/* Stats Grid */}
            <div style={s.statsGrid}>
              <div style={s.statCard}>
                <div style={{ ...s.statIcon, color: '#60a5fa' }}><Icons.Video /></div>
                <div style={s.statValue}>{state.videosWatched}</div>
                <div style={s.statLabel}>Videos</div>
              </div>
              <div style={s.statCard}>
                <div style={{ ...s.statIcon, color: '#a78bfa' }}><Icons.Layers /></div>
                <div style={s.statValue}>{state.youtubeTabs}</div>
                <div style={s.statLabel}>Tabs</div>
              </div>
              <div style={s.statCard}>
                <div style={{ ...s.statIcon, color: '#4ade80' }}><Icons.ThumbsUp /></div>
                <div style={s.statValue}>{state.productiveCount}</div>
                <div style={s.statLabel}>Good</div>
              </div>
              <div style={s.statCard}>
                <div style={{ ...s.statIcon, color: '#f87171' }}><Icons.ThumbsDown /></div>
                <div style={s.statValue}>{state.unproductiveCount}</div>
                <div style={s.statLabel}>Wasted</div>
              </div>
            </div>
            
            {/* Drift Meter 🌊 */}
            <div style={{
              padding: '12px',
              background: state.drift.level === 'critical' 
                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.15) 100%)'
                : state.drift.level === 'high'
                ? 'linear-gradient(135deg, rgba(251, 146, 60, 0.15) 0%, rgba(234, 88, 12, 0.15) 100%)'
                : state.drift.level === 'medium'
                ? 'linear-gradient(135deg, rgba(250, 204, 21, 0.15) 0%, rgba(202, 138, 4, 0.15) 100%)'
                : 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(22, 163, 74, 0.15) 100%)',
              borderRadius: '12px',
              marginBottom: '16px',
              border: `1px solid ${
                state.drift.level === 'critical' ? 'rgba(239, 68, 68, 0.3)' :
                state.drift.level === 'high' ? 'rgba(251, 146, 60, 0.3)' :
                state.drift.level === 'medium' ? 'rgba(250, 204, 21, 0.3)' :
                'rgba(34, 197, 94, 0.3)'
              }`,
              animation: state.drift.level === 'critical' ? 'yt-detox-glow 2s ease-in-out infinite' : undefined,
              transition: 'background 0.5s ease, border-color 0.5s ease',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'rgba(255,255,255,0.9)' }}>
                  <Icons.Waves />
                  <span style={{ fontWeight: '600' }}>Drift</span>
                </div>
                <span style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: state.drift.level === 'critical' ? '#f87171' :
                         state.drift.level === 'high' ? '#fb923c' :
                         state.drift.level === 'medium' ? '#fbbf24' :
                         '#4ade80',
                }}>
                  {Math.round(state.drift.drift * 100)}%
                </span>
              </div>
              <div style={{
                height: '6px',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '3px',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${state.drift.drift * 100}%`,
                  background: state.drift.level === 'critical' 
                    ? 'linear-gradient(90deg, #f87171 0%, #ef4444 100%)'
                    : state.drift.level === 'high'
                    ? 'linear-gradient(90deg, #fb923c 0%, #f97316 100%)'
                    : state.drift.level === 'medium'
                    ? 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)'
                    : 'linear-gradient(90deg, #4ade80 0%, #22c55e 100%)',
                  borderRadius: '3px',
                  transition: 'width 0.5s ease, background 0.3s ease',
                }} />
              </div>
              <div style={{ 
                fontSize: '10px', 
                color: 'rgba(255,255,255,0.5)', 
                marginTop: '6px',
                textAlign: 'center',
              }}>
                {state.drift.level === 'low' && "You're staying focused 🎯"}
                {state.drift.level === 'medium' && "Starting to drift... 🌊"}
                {state.drift.level === 'high' && "Drifting away from your goals ⚠️"}
                {state.drift.level === 'critical' && "High drift — friction active 🔴"}
              </div>
            </div>
            
            {/* Productive Alternative Suggestion */}
            {state.suggestedUrl && state.drift.level !== 'low' && (
              <div style={{
                padding: '12px',
                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(22, 163, 74, 0.15) 100%)',
                borderRadius: '12px',
                marginBottom: '16px',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                animation: 'yt-detox-wave 2s ease-in-out infinite',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ color: '#4ade80' }}><Icons.Sparkles /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>
                      How about something productive?
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#fff' }}>
                      {state.suggestedUrl.title}
                    </div>
                  </div>
                  <button 
                    onClick={() => dismissSuggestion()}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: '4px' }}
                  >
                    <Icons.X />
                  </button>
                </div>
                <button
                  onClick={() => openSuggestion(state.suggestedUrl!.url)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'rgba(34, 197, 94, 0.2)',
                    border: '1px solid rgba(34, 197, 94, 0.4)',
                    borderRadius: '8px',
                    color: '#4ade80',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  Open Instead <Icons.ExternalLink />
                </button>
              </div>
            )}
            
            {/* 24h Day Cycle */}
            {state.hourlyData.some(v => v > 0) && (
              <div style={s.weeklySection}>
                <div style={s.weeklyHeader}>
                  <div style={s.weeklyTitle}><Icons.Clock /> Today</div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>
                    {formatMinutes(state.hourlyData.reduce((a, b) => a + b, 0))} total
                  </div>
                </div>
                <DayCycleChart data={state.hourlyData} />
              </div>
            )}
            
            {/* Daily Progress */}
            <div style={s.progressSection}>
              <div style={s.progressHeader}>
                <div style={s.progressLabel}><Icons.Target /> Daily Goal</div>
                <span style={{ ...s.progressValue, color: getProgressTextColor() }}>
                  {formatMinutes(state.todayMinutes)} / {formatMinutes(state.dailyGoal)}
                  {state.todayBackgroundMinutes > 0 && (
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginLeft: '4px', fontWeight: '400' }}>
                      (+{formatMinutes(state.todayBackgroundMinutes)} bg)
                    </span>
                  )}
                </span>
              </div>
              <div style={s.progressBar}>
                <div style={{ ...s.progressFill, width: `${progressPercent}%`, background: getProgressColor() }} />
              </div>
              {state.todayBackgroundMinutes > 0 && !isOverGoal && (
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  🎧 +{formatMinutes(state.todayBackgroundMinutes)} background
                </div>
              )}
              {isOverGoal && (
                <div style={s.overLimit}><Icons.Flame /> Over by {formatMinutes(state.todayMinutes - state.dailyGoal)}</div>
              )}
            </div>
            
            {/* Achievements */}
            {state.achievements.length > 0 && (
              <div style={s.achievementRow}>
                {state.achievements.slice(0, 3).map((a, i) => (
                  <div key={i} style={s.achievementBadge}>{a}</div>
                ))}
              </div>
            )}
            
            {/* Current Video */}
            {state.videoTitle && (
              <div style={s.nowWatching}>
                <div style={s.nowWatchingHeader}>
                  <div style={{ color: '#facc15', flexShrink: 0 }}><Icons.Zap /></div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={s.nowWatchingLabel}>Now watching</div>
                    <div style={s.nowWatchingTitle}>{state.videoTitle}</div>
                    <div style={s.nowWatchingTime}>{formatTime(state.currentVideoSeconds)} watched</div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Productivity prompt now shows as full-screen friction overlay */}
          </div>
        )}
      </div>
    </div>
  );
}
