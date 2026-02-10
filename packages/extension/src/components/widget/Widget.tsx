import { useState, useEffect, useCallback } from 'react';
import {
  getCurrentSession,
  getCurrentVideoSession,
  getCurrentVideoInfo,
  rateVideo,
} from '../../content/tracker';

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

// Icons as SVG components (avoiding lucide-react for shadow DOM)
const Icons = {
  Clock: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
    </svg>
  ),
  Video: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m10 9 5 3-5 3V9z"/>
    </svg>
  ),
  ThumbsUp: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/>
    </svg>
  ),
  ThumbsDown: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z"/>
    </svg>
  ),
  Minus: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14"/>
    </svg>
  ),
  ChevronUp: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m18 15-6-6-6 6"/>
    </svg>
  ),
  ChevronDown: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6"/>
    </svg>
  ),
  Target: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
    </svg>
  ),
  Flame: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
    </svg>
  ),
  Zap: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
};

// Styles object
const styles = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '14px',
    color: '#fff',
  },
  pill: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    background: 'rgba(0, 0, 0, 0.85)',
    backdropFilter: 'blur(8px)',
    borderRadius: '9999px',
    fontSize: '13px',
    fontWeight: '500',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  card: {
    background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.97) 0%, rgba(30, 41, 59, 0.97) 100%)',
    backdropFilter: 'blur(16px)',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    width: '280px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#22c55e',
    animation: 'pulse 2s infinite',
  },
  headerTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  headerButtons: {
    display: 'flex',
    gap: '4px',
  },
  iconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    color: 'rgba(255, 255, 255, 0.6)',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  body: {
    padding: '16px',
  },
  timerSection: {
    textAlign: 'center' as const,
    padding: '8px 0',
  },
  timerValue: {
    fontSize: '36px',
    fontWeight: '700',
    color: '#fff',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-1px',
  },
  timerLabel: {
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.5)',
    textTransform: 'uppercase' as const,
    letterSpacing: '1.5px',
    marginTop: '4px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
    marginTop: '16px',
  },
  statCard: {
    padding: '12px 8px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
    textAlign: 'center' as const,
  },
  statIcon: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '4px',
  },
  statValue: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#fff',
  },
  statLabel: {
    fontSize: '9px',
    color: 'rgba(255, 255, 255, 0.5)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginTop: '2px',
  },
  progressSection: {
    marginTop: '16px',
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  progressLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  progressValue: {
    fontSize: '11px',
    fontWeight: '500',
  },
  progressBar: {
    height: '8px',
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.5s ease',
  },
  overLimitWarning: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    fontSize: '11px',
    color: '#f87171',
    marginTop: '8px',
  },
  nowWatching: {
    marginTop: '16px',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
  },
  nowWatchingHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
  },
  nowWatchingLabel: {
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: '2px',
  },
  nowWatchingTitle: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.9)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  nowWatchingTime: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: '4px',
  },
  prompt: {
    marginTop: '16px',
    padding: '12px',
    background: 'linear-gradient(135deg, rgba(147, 51, 234, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)',
    borderRadius: '12px',
    border: '1px solid rgba(147, 51, 234, 0.3)',
  },
  promptText: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: '12px',
  },
  ratingButtons: {
    display: 'flex',
    gap: '8px',
  },
  ratingButton: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px',
    border: 'none',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'transform 0.1s, opacity 0.2s',
  },
};

export default function Widget(): JSX.Element {
  const [state, setState] = useState<WidgetState>({
    collapsed: false,
    minimized: false,
    sessionDuration: 0,
    videosWatched: 0,
    todayMinutes: 0,
    dailyGoal: 60,
    showPrompt: false,
    videoTitle: null,
    lastRatedVideo: null,
    productiveCount: 0,
    unproductiveCount: 0,
    currentVideoSeconds: 0,
  });
  
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
      if (response && !response.error) {
        setState((prev) => ({ ...prev, dailyGoal: response.dailyGoalMinutes || 60 }));
      }
    });
  }, []);
  
  useEffect(() => {
    const updateStats = () => {
      const browserSession = getCurrentSession();
      const videoSession = getCurrentVideoSession();
      const videoInfo = getCurrentVideoInfo();
      
      if (browserSession) {
        setState((prev) => ({
          ...prev,
          sessionDuration: browserSession.totalDurationSeconds,
          videosWatched: browserSession.videosWatched,
          productiveCount: browserSession.productiveVideos,
          unproductiveCount: browserSession.unproductiveVideos,
        }));
      }
      
      if (videoSession) {
        setState((prev) => ({ ...prev, currentVideoSeconds: videoSession.watchedSeconds }));
      }
      
      if (videoInfo) {
        setState((prev) => ({ ...prev, videoTitle: videoInfo.title || null }));
      }
      
      chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
        if (response?.today) {
          setState((prev) => ({ ...prev, todayMinutes: Math.floor(response.today.totalSeconds / 60) }));
        }
      });
      
      if (videoSession && !videoSession.productivityRating && state.lastRatedVideo !== videoSession.id) {
        const watchedSeconds = videoSession.watchedSeconds;
        const shouldPrompt = (watchedSeconds > 30 && Math.random() < 0.3) || videoSession.watchedPercent >= 80;
        if (shouldPrompt && !state.showPrompt) {
          setState((prev) => ({ ...prev, showPrompt: true }));
          chrome.runtime.sendMessage({ type: 'PROMPT_SHOWN' });
        }
      }
    };
    
    updateStats();
    const interval = setInterval(updateStats, 1000);
    return () => clearInterval(interval);
  }, [state.lastRatedVideo, state.showPrompt]);
  
  const handleRate = useCallback((rating: -1 | 0 | 1) => {
    const videoSession = getCurrentVideoSession();
    if (videoSession) {
      rateVideo(rating);
      setState((prev) => ({ ...prev, showPrompt: false, lastRatedVideo: videoSession.id }));
    }
  }, []);
  
  const progressPercent = Math.min((state.todayMinutes / state.dailyGoal) * 100, 100);
  const isOverGoal = progressPercent >= 100;
  const isNearGoal = progressPercent >= 80;
  
  const getProgressColor = () => {
    if (isOverGoal) return 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)';
    if (isNearGoal) return 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)';
    return 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)';
  };
  
  const getProgressTextColor = () => {
    if (isOverGoal) return '#f87171';
    if (isNearGoal) return '#fbbf24';
    return 'rgba(255, 255, 255, 0.7)';
  };
  
  // Minimized pill view
  if (state.minimized) {
    return (
      <div style={styles.container}>
        <div 
          style={styles.pill}
          onClick={() => setState(p => ({ ...p, minimized: false }))}
          onMouseOver={e => (e.currentTarget.style.background = 'rgba(0, 0, 0, 0.95)')}
          onMouseOut={e => (e.currentTarget.style.background = 'rgba(0, 0, 0, 0.85)')}
        >
          <Icons.Clock />
          <span>{formatTime(state.sessionDuration)}</span>
          <span style={{ width: '1px', height: '12px', background: 'rgba(255,255,255,0.3)' }} />
          <span style={{ color: isOverGoal ? '#f87171' : 'rgba(255,255,255,0.7)' }}>
            {formatMinutes(state.todayMinutes)}
          </span>
        </div>
      </div>
    );
  }
  
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.statusDot} />
            <span style={styles.headerTitle}>YouTube Detox</span>
          </div>
          <div style={styles.headerButtons}>
            <button 
              style={styles.iconButton}
              onClick={() => setState(p => ({ ...p, minimized: true }))}
              onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
              onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
            >
              <Icons.Minus />
            </button>
            <button 
              style={styles.iconButton}
              onClick={() => setState(p => ({ ...p, collapsed: !p.collapsed }))}
              onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
              onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
            >
              {state.collapsed ? <Icons.ChevronDown /> : <Icons.ChevronUp />}
            </button>
          </div>
        </div>
        
        {!state.collapsed && (
          <div style={styles.body}>
            {/* Session Timer */}
            <div style={styles.timerSection}>
              <div style={styles.timerValue}>{formatTime(state.sessionDuration)}</div>
              <div style={styles.timerLabel}>Session Time</div>
            </div>
            
            {/* Stats Grid */}
            <div style={styles.statsGrid}>
              <div style={styles.statCard}>
                <div style={{ ...styles.statIcon, color: '#60a5fa' }}><Icons.Video /></div>
                <div style={styles.statValue}>{state.videosWatched}</div>
                <div style={styles.statLabel}>Videos</div>
              </div>
              <div style={styles.statCard}>
                <div style={{ ...styles.statIcon, color: '#4ade80' }}><Icons.ThumbsUp /></div>
                <div style={styles.statValue}>{state.productiveCount}</div>
                <div style={styles.statLabel}>Good</div>
              </div>
              <div style={styles.statCard}>
                <div style={{ ...styles.statIcon, color: '#f87171' }}><Icons.ThumbsDown /></div>
                <div style={styles.statValue}>{state.unproductiveCount}</div>
                <div style={styles.statLabel}>Wasted</div>
              </div>
            </div>
            
            {/* Daily Progress */}
            <div style={styles.progressSection}>
              <div style={styles.progressHeader}>
                <div style={styles.progressLabel}>
                  <Icons.Target />
                  <span>Daily Goal</span>
                </div>
                <span style={{ ...styles.progressValue, color: getProgressTextColor() }}>
                  {formatMinutes(state.todayMinutes)} / {formatMinutes(state.dailyGoal)}
                </span>
              </div>
              <div style={styles.progressBar}>
                <div style={{ 
                  ...styles.progressFill, 
                  width: `${progressPercent}%`,
                  background: getProgressColor(),
                }} />
              </div>
              {isOverGoal && (
                <div style={styles.overLimitWarning}>
                  <Icons.Flame />
                  <span>Over limit by {formatMinutes(state.todayMinutes - state.dailyGoal)}</span>
                </div>
              )}
            </div>
            
            {/* Current Video */}
            {state.videoTitle && (
              <div style={styles.nowWatching}>
                <div style={styles.nowWatchingHeader}>
                  <div style={{ color: '#facc15', flexShrink: 0 }}><Icons.Zap /></div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={styles.nowWatchingLabel}>Now watching</div>
                    <div style={styles.nowWatchingTitle}>{state.videoTitle}</div>
                    <div style={styles.nowWatchingTime}>{formatTime(state.currentVideoSeconds)} watched</div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Productivity Prompt */}
            {state.showPrompt && (
              <div style={styles.prompt}>
                <div style={styles.promptText}>
                  <span style={{ color: '#c084fc' }}>💭</span>
                  <span>Was this worth your time?</span>
                </div>
                <div style={styles.ratingButtons}>
                  <button 
                    style={{ ...styles.ratingButton, background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80' }}
                    onClick={() => handleRate(1)}
                    onMouseOver={e => (e.currentTarget.style.background = 'rgba(34, 197, 94, 0.3)')}
                    onMouseOut={e => (e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)')}
                  >
                    <Icons.ThumbsUp /> Yes
                  </button>
                  <button 
                    style={{ ...styles.ratingButton, background: 'rgba(255, 255, 255, 0.1)', color: 'rgba(255,255,255,0.7)' }}
                    onClick={() => handleRate(0)}
                    onMouseOver={e => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)')}
                    onMouseOut={e => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
                  >
                    <Icons.Minus /> Meh
                  </button>
                  <button 
                    style={{ ...styles.ratingButton, background: 'rgba(239, 68, 68, 0.2)', color: '#f87171' }}
                    onClick={() => handleRate(-1)}
                    onMouseOver={e => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.3)')}
                    onMouseOut={e => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)')}
                  >
                    <Icons.ThumbsDown /> No
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
