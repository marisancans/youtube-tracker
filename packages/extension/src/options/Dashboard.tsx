import { useEffect, useState, useCallback } from 'react';
import PirateMap from '../components/map/PirateMap';
import type { IslandId } from '../components/map/island-sprites';
import type { DriftSnapshot } from '../background/storage';
import { toggleMute, isMuted, playSound } from '../lib/audio';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Stats {
  videos: number;
  todayMinutes: number;
  focusScore: number;
}

type DriftLevel = 'low' | 'medium' | 'high' | 'critical';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMinutes(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const HUD_BASE: React.CSSProperties = {
  position: 'absolute',
  zIndex: 10,
  pointerEvents: 'auto',
  background: 'rgba(245, 230, 200, 0.9)',
  backdropFilter: 'blur(8px)',
  border: '1px solid rgba(184, 149, 106, 0.5)',
  borderRadius: '10px',
  color: '#2c1810',
  fontFamily: '"Source Sans 3", sans-serif',
};

const HEADING_FONT: React.CSSProperties = {
  fontFamily: '"Playfair Display", serif',
};

const PANEL_BG: React.CSSProperties = {
  ...HUD_BASE,
  borderRadius: 0,
  borderLeft: '3px solid rgba(184, 149, 106, 0.7)',
  top: 0,
  right: 0,
  width: 400,
  height: '100vh',
  overflowY: 'auto',
  padding: '24px',
  transition: 'transform 0.3s ease',
};

// ---------------------------------------------------------------------------
// Panel content configs
// ---------------------------------------------------------------------------

const PANEL_TITLES: Record<string, string> = {
  harbor: 'Harbor Town -- Daily Goal',
  fort: 'The Fort -- Challenge Tier',
  fog: 'Fog Bank -- Friction Settings',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Dashboard() {
  // State
  const [stats, setStats] = useState<Stats>({ videos: 0, todayMinutes: 0, focusScore: 100 });
  const [drift, setDrift] = useState(0);
  const [driftLevel, setDriftLevel] = useState<DriftLevel>('low');
  const [driftHistory, setDriftHistory] = useState<DriftSnapshot[]>([]);
  const [streak, setStreak] = useState(0);
  const [achievements, setAchievements] = useState(0);
  const [xp, setXp] = useState(0);
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(60);
  const [syncOk, setSyncOk] = useState(false);
  const [activePanel, setActivePanel] = useState<IslandId | null>(null);
  const [tooltip, setTooltip] = useState<IslandId | null>(null);
  const [muted, setMuted] = useState(isMuted());

  // Settings for panels
  const [goalSlider, setGoalSlider] = useState(60);
  const [challengeTier, setChallengeTier] = useState('casual');
  const [frictionToggles, setFrictionToggles] = useState({
    thumbnails: true,
    sidebar: true,
    comments: false,
    autoplay: true,
  });

  // Data fetching
  const fetchAll = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATS' }, (r) => {
      if (r) {
        const todayMinutes = r.today ? Math.floor((r.today.totalSeconds || 0) / 60) : 0;
        const videos = r.today?.videoCount ?? 0;
        setStats((prev) => ({ ...prev, videos, todayMinutes }));
      }
    });

    chrome.runtime.sendMessage({ type: 'GET_DRIFT' }, (r) => {
      if (r && typeof r.drift === 'number') {
        setDrift(r.drift);
        setDriftLevel(r.level || 'low');
      }
    });

    chrome.runtime.sendMessage({ type: 'GET_DRIFT_HISTORY' }, (r) => {
      if (r?.snapshots && Array.isArray(r.snapshots)) {
        setDriftHistory(r.snapshots);
      } else if (r?.history && Array.isArray(r.history)) {
        setDriftHistory(r.history);
      }
    });

    chrome.runtime.sendMessage({ type: 'GET_STREAK' }, (r) => {
      if (r) setStreak(r.streak || 0);
    });

    chrome.runtime.sendMessage({ type: 'GET_ACHIEVEMENTS' }, (r) => {
      if (r?.unlocked) {
        setAchievements(r.unlocked.length || 0);
      }
    });

    chrome.runtime.sendMessage({ type: 'GET_CHALLENGE_PROGRESS' }, (r) => {
      if (r?.tier) setChallengeTier(r.tier);
    });
  }, []);

  // Initial fetch + periodic refresh
  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 10_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Read XP, settings, syncState from storage
  useEffect(() => {
    chrome.storage.local.get(['xp', 'settings', 'syncState'], (result) => {
      setXp(result.xp || 0);
      setSyncOk(!!result.syncState?.lastSyncTime);
      const s = result.settings || {};
      if (s.dailyGoalMinutes) {
        setDailyGoalMinutes(s.dailyGoalMinutes);
        setGoalSlider(s.dailyGoalMinutes);
      }
      if (s.challengeTier) setChallengeTier(s.challengeTier);
      if (s.frictionEnabled) setFrictionToggles(s.frictionEnabled);
    });
  }, []);

  // Escape key handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActivePanel(null);
        setTooltip(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Island click handler
  const handleIslandClick = useCallback((id: IslandId) => {
    playSound('click');
    const statIslands: IslandId[] = ['lookout', 'lighthouse', 'focus', 'treasure'];
    if (statIslands.includes(id)) {
      setTooltip((prev) => (prev === id ? null : id));
      setActivePanel(null);
    } else {
      setActivePanel((prev) => (prev === id ? null : id));
      setTooltip(null);
    }
  }, []);

  // Mute toggle
  const handleMuteToggle = useCallback(() => {
    const nowMuted = toggleMute();
    setMuted(nowMuted);
  }, []);

  // Backdrop click closes panel/tooltip
  const handleBackdropClick = useCallback(() => {
    setActivePanel(null);
    setTooltip(null);
  }, []);

  // Save settings helpers
  const saveGoal = useCallback((minutes: number) => {
    setGoalSlider(minutes);
    setDailyGoalMinutes(minutes);
    chrome.storage.local.get('settings', (result) => {
      const s = result.settings || {};
      s.dailyGoalMinutes = minutes;
      chrome.storage.local.set({ settings: s });
    });
  }, []);

  const saveTier = useCallback((tier: string) => {
    setChallengeTier(tier);
    chrome.storage.local.get('settings', (result) => {
      const s = result.settings || {};
      s.challengeTier = tier;
      chrome.storage.local.set({ settings: s });
    });
  }, []);

  const saveFriction = useCallback((key: string, value: boolean) => {
    setFrictionToggles((prev) => {
      const next = { ...prev, [key]: value };
      chrome.storage.local.get('settings', (result) => {
        const s = result.settings || {};
        s.frictionEnabled = next;
        chrome.storage.local.set({ settings: s });
      });
      return next;
    });
  }, []);

  // Derived values
  const level = Math.floor(xp / 100) + 1;
  const xpInLevel = xp % 100;
  const goalProgress = dailyGoalMinutes > 0 ? Math.min(100, (stats.todayMinutes / dailyGoalMinutes) * 100) : 0;
  const focusScore = Math.max(0, Math.min(100, Math.round(100 - (stats.todayMinutes / Math.max(dailyGoalMinutes, 1)) * 100)));

  // Rank from tier
  const RANK_MAP: Record<string, string> = {
    casual: 'Deckhand',
    focused: 'Helmsman',
    disciplined: 'First Mate',
    monk: 'Captain',
    ascetic: 'Admiral',
  };
  const rank = RANK_MAP[challengeTier] || 'Deckhand';

  // Tooltip content
  const tooltipContent: Record<string, { title: string; detail: string }> = {
    lookout: { title: 'Lookout Tower', detail: `${stats.videos} videos watched today` },
    lighthouse: { title: 'Lighthouse', detail: `${streak} day streak${syncOk ? ' (synced)' : ''}` },
    focus: { title: 'Focus Score', detail: `${focusScore}% productive today` },
    treasure: { title: 'Treasure Chest', detail: `${achievements} achievements unlocked` },
  };

  // Tier descriptions
  const TIER_OPTIONS: Array<{ value: string; label: string; desc: string }> = [
    { value: 'casual', label: 'Casual (Deckhand)', desc: '60 min limit -- 1.0x XP' },
    { value: 'focused', label: 'Focused (Helmsman)', desc: '45 min limit -- 1.5x XP' },
    { value: 'disciplined', label: 'Disciplined (First Mate)', desc: '30 min limit -- 2.0x XP' },
    { value: 'monk', label: 'Monk (Captain)', desc: '15 min limit -- 3.0x XP' },
    { value: 'ascetic', label: 'Ascetic (Admiral)', desc: '5 min limit -- 5.0x XP' },
  ];

  const FRICTION_OPTIONS: Array<{ key: string; label: string }> = [
    { key: 'thumbnails', label: 'Blur thumbnails when drifting' },
    { key: 'sidebar', label: 'Hide sidebar recommendations' },
    { key: 'comments', label: 'Collapse comments section' },
    { key: 'autoplay', label: 'Disable autoplay when over goal' },
  ];

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', background: '#0a1628' }}>
      {/* Full-page pirate map */}
      <PirateMap
        mode="full"
        driftHistory={driftHistory}
        currentDrift={drift}
        currentLevel={driftLevel}
        streak={streak}
        syncOk={syncOk}
        stats={{
          videos: stats.videos,
          streak,
          focusScore,
          achievements,
          xp,
          level,
        }}
        onIslandClick={handleIslandClick}
      />

      {/* ================================================================ */}
      {/* HUD: Top-center — Captain's Log banner                          */}
      {/* ================================================================ */}
      <div
        style={{
          ...HUD_BASE,
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '8px 28px',
          background: 'linear-gradient(135deg, rgba(245, 230, 200, 0.92), rgba(230, 210, 175, 0.92))',
          borderImage: 'none',
          textAlign: 'center',
        }}
      >
        <h1 style={{ ...HEADING_FONT, fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: '0.5px' }}>
          Captain's Log
        </h1>
      </div>

      {/* ================================================================ */}
      {/* HUD: Top-left — Session duration + daily goal                   */}
      {/* ================================================================ */}
      <div style={{ ...HUD_BASE, top: 16, left: 16, padding: '12px 16px', minWidth: 200 }}>
        <div style={{ ...HEADING_FONT, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
          Today's Voyage
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span style={{ ...HEADING_FONT, fontSize: 22, fontWeight: 700 }}>
            {formatMinutes(stats.todayMinutes)}
          </span>
          <span style={{ fontSize: 12, opacity: 0.6 }}>
            / {formatMinutes(dailyGoalMinutes)}
          </span>
        </div>
        {/* Progress bar */}
        <div style={{
          height: 8,
          borderRadius: 4,
          background: 'rgba(44, 24, 16, 0.12)',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            borderRadius: 4,
            width: `${Math.min(goalProgress, 100)}%`,
            background: goalProgress > 100
              ? 'linear-gradient(90deg, #991b1b, #dc2626)'
              : 'linear-gradient(90deg, #0d9488, #5eead4)',
            transition: 'width 0.5s ease',
          }} />
        </div>
        <div style={{ fontSize: 11, marginTop: 4, opacity: 0.55 }}>
          {stats.todayMinutes > dailyGoalMinutes
            ? `+${formatMinutes(stats.todayMinutes - dailyGoalMinutes)} over goal`
            : `${formatMinutes(dailyGoalMinutes - stats.todayMinutes)} remaining`}
        </div>
      </div>

      {/* ================================================================ */}
      {/* HUD: Top-right — Mute + Settings                                */}
      {/* ================================================================ */}
      <div style={{ ...HUD_BASE, top: 16, right: 16, padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={handleMuteToggle}
          title={muted ? 'Unmute' : 'Mute'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 18,
            padding: '4px 6px',
            borderRadius: 6,
            color: '#2c1810',
          }}
        >
          {muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'}
        </button>
        <button
          onClick={() => { window.location.hash = ''; }}
          title="Settings"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 18,
            padding: '4px 6px',
            borderRadius: 6,
            color: '#2c1810',
          }}
        >
          {'\u2699\uFE0F'}
        </button>
      </div>

      {/* ================================================================ */}
      {/* HUD: Bottom-left — Level / XP bar + rank badge                  */}
      {/* ================================================================ */}
      <div style={{ ...HUD_BASE, bottom: 16, left: 16, padding: '12px 16px', minWidth: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #b8956a, #d4a574)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            ...HEADING_FONT,
            fontSize: 14,
            fontWeight: 700,
            color: '#2c1810',
            border: '2px solid rgba(184, 149, 106, 0.6)',
          }}>
            {level}
          </div>
          <div>
            <div style={{ ...HEADING_FONT, fontSize: 14, fontWeight: 600 }}>{rank}</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>Level {level} -- {xpInLevel}/100 XP</div>
          </div>
        </div>
        {/* XP bar */}
        <div style={{
          height: 6,
          borderRadius: 3,
          background: 'rgba(44, 24, 16, 0.12)',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            borderRadius: 3,
            width: `${xpInLevel}%`,
            background: 'linear-gradient(90deg, #d4a574, #b8956a)',
            transition: 'width 0.5s ease',
          }} />
        </div>
      </div>

      {/* ================================================================ */}
      {/* Stat Tooltip (for lookout, lighthouse, focus, treasure)          */}
      {/* ================================================================ */}
      {tooltip && tooltipContent[tooltip] && (
        <>
          {/* Invisible backdrop to close tooltip */}
          <div
            onClick={handleBackdropClick}
            style={{ position: 'fixed', inset: 0, zIndex: 8 }}
          />
          <div style={{
            ...HUD_BASE,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            padding: '16px 24px',
            minWidth: 240,
            textAlign: 'center',
            zIndex: 12,
          }}>
            <div style={{ ...HEADING_FONT, fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
              {tooltipContent[tooltip].title}
            </div>
            <div style={{ fontSize: 14, opacity: 0.8 }}>
              {tooltipContent[tooltip].detail}
            </div>
          </div>
        </>
      )}

      {/* ================================================================ */}
      {/* Side Panel (for harbor, fort, fog)                               */}
      {/* ================================================================ */}
      {activePanel && PANEL_TITLES[activePanel] && (
        <>
          {/* Backdrop */}
          <div
            onClick={handleBackdropClick}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(10, 22, 40, 0.4)',
              zIndex: 14,
            }}
          />
          <div style={{
            ...PANEL_BG,
            transform: 'translateX(0)',
            zIndex: 15,
            position: 'fixed',
          }}>
            {/* Close button */}
            <button
              onClick={() => setActivePanel(null)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 22,
                color: '#2c1810',
                lineHeight: 1,
              }}
            >
              {'\u2715'}
            </button>

            {/* Title */}
            <h2 style={{ ...HEADING_FONT, fontSize: 20, fontWeight: 700, marginBottom: 24 }}>
              {PANEL_TITLES[activePanel]}
            </h2>

            {/* Harbor: Daily goal slider */}
            {activePanel === 'harbor' && (
              <div>
                <label style={{ display: 'block', fontSize: 14, marginBottom: 12, fontWeight: 600 }}>
                  Daily Watch Limit: {formatMinutes(goalSlider)}
                </label>
                <input
                  type="range"
                  min={5}
                  max={180}
                  step={5}
                  value={goalSlider}
                  onChange={(e) => saveGoal(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#b8956a' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.5, marginTop: 4 }}>
                  <span>5m</span>
                  <span>3h</span>
                </div>
                <p style={{ fontSize: 13, marginTop: 16, opacity: 0.7, lineHeight: 1.5 }}>
                  Set a daily time goal for YouTube watching. The map tracks your progress toward
                  this limit, and your ship drifts further when you exceed it.
                </p>
              </div>
            )}

            {/* Fort: Challenge tier selector */}
            {activePanel === 'fort' && (
              <div>
                <p style={{ fontSize: 13, marginBottom: 16, opacity: 0.7 }}>
                  Higher tiers have stricter limits but award more XP.
                </p>
                {TIER_OPTIONS.map((t) => (
                  <label
                    key={t.value}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '10px 12px',
                      marginBottom: 8,
                      borderRadius: 8,
                      border: challengeTier === t.value ? '2px solid #b8956a' : '1px solid rgba(184, 149, 106, 0.25)',
                      background: challengeTier === t.value ? 'rgba(184, 149, 106, 0.1)' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="tier"
                      checked={challengeTier === t.value}
                      onChange={() => saveTier(t.value)}
                      style={{ marginTop: 3, accentColor: '#b8956a' }}
                    />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{t.label}</div>
                      <div style={{ fontSize: 12, opacity: 0.6 }}>{t.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {/* Fog: Friction toggles */}
            {activePanel === 'fog' && (
              <div>
                <p style={{ fontSize: 13, marginBottom: 16, opacity: 0.7 }}>
                  Friction effects activate when your drift level rises, making YouTube
                  less appealing and helping you disengage.
                </p>
                {FRICTION_OPTIONS.map((opt) => (
                  <label
                    key={opt.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      marginBottom: 8,
                      borderRadius: 8,
                      border: '1px solid rgba(184, 149, 106, 0.25)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={frictionToggles[opt.key as keyof typeof frictionToggles] ?? false}
                      onChange={(e) => saveFriction(opt.key, e.target.checked)}
                      style={{ accentColor: '#b8956a', width: 18, height: 18 }}
                    />
                    <span style={{ fontSize: 14 }}>{opt.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
