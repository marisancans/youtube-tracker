import { useState, useEffect, useCallback } from 'react';
import type { Settings } from '@yt-detox/shared';
import {
  getCurrentSession,
  getCurrentVideoSession,
  getCurrentVideoInfo,
  rateVideo,
} from '../../content/tracker';

interface WidgetState {
  collapsed: boolean;
  sessionDuration: number;
  videosWatched: number;
  todayMinutes: number;
  dailyGoal: number;
  showPrompt: boolean;
  videoTitle: string | null;
  lastRatedVideo: string | null;
  productiveCount: number;
  unproductiveCount: number;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function Widget(): JSX.Element {
  const [state, setState] = useState<WidgetState>({
    collapsed: false,
    sessionDuration: 0,
    videosWatched: 0,
    todayMinutes: 0,
    dailyGoal: 60,
    showPrompt: false,
    videoTitle: null,
    lastRatedVideo: null,
    productiveCount: 0,
    unproductiveCount: 0,
  });
  
  const [settings, setSettings] = useState<Settings | null>(null);
  
  // Fetch settings on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
      if (response && !response.error) {
        setSettings(response);
        setState((prev) => ({
          ...prev,
          dailyGoal: response.dailyGoalMinutes || 60,
        }));
      }
    });
  }, []);
  
  // Update stats periodically
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
      
      if (videoInfo) {
        setState((prev) => ({
          ...prev,
          videoTitle: videoInfo.title || null,
        }));
      }
      
      // Fetch today's stats from background
      chrome.runtime.sendMessage({ type: 'GET_STATS' }, (response) => {
        if (response?.today) {
          setState((prev) => ({
            ...prev,
            todayMinutes: Math.floor(response.today.totalSeconds / 60),
          }));
        }
      });
      
      // Check if we should show productivity prompt
      if (videoSession && !videoSession.productivityRating && state.lastRatedVideo !== videoSession.id) {
        // Show prompt after watching for a bit (30+ seconds) or video ended
        const watchedSeconds = videoSession.watchedSeconds;
        const shouldPrompt = 
          (watchedSeconds > 30 && Math.random() < 0.3) || // Random chance after 30s
          videoSession.watchedPercent >= 80; // Near end
        
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
      setState((prev) => ({
        ...prev,
        showPrompt: false,
        lastRatedVideo: videoSession.id,
      }));
    }
  }, []);
  
  const toggleCollapsed = useCallback(() => {
    setState((prev) => ({ ...prev, collapsed: !prev.collapsed }));
  }, []);
  
  const progressPercent = Math.min((state.todayMinutes / state.dailyGoal) * 100, 100);
  const progressClass = progressPercent >= 100 ? 'danger' : progressPercent >= 80 ? 'warning' : '';
  
  return (
    <div className={`widget-root ${state.collapsed ? 'collapsed' : ''}`}>
      <div className="widget-header">
        <span className="widget-title">YouTube Detox</span>
        <button className="toggle-btn" onClick={toggleCollapsed}>
          {state.collapsed ? '▼' : '▲'}
        </button>
      </div>
      
      {!state.collapsed && (
        <div className="widget-body">
          {/* Session Timer */}
          <div className="session-timer">
            <div>
              <div className="timer-value">{formatTime(state.sessionDuration)}</div>
              <div className="timer-label">this session</div>
            </div>
          </div>
          
          {/* Stats Grid */}
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-value">{state.videosWatched}</div>
              <div className="stat-label">Videos</div>
            </div>
            <div className="stat-item">
              <div className="stat-value" style={{ color: '#2ecc71' }}>{state.productiveCount}</div>
              <div className="stat-label">Productive</div>
            </div>
            <div className="stat-item">
              <div className="stat-value" style={{ color: '#e74c3c' }}>{state.unproductiveCount}</div>
              <div className="stat-label">Time-sink</div>
            </div>
          </div>
          
          {/* Daily Goal Progress */}
          <div className="goal-progress">
            <div className="progress-bar">
              <div 
                className={`progress-fill ${progressClass}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="progress-label">
              <span>{state.todayMinutes}m today</span>
              <span>Goal: {state.dailyGoal}m</span>
            </div>
          </div>
          
          {/* Productivity Prompt */}
          {state.showPrompt && (
            <div className="productivity-prompt">
              <div className="prompt-text">
                {state.videoTitle 
                  ? `Was "${state.videoTitle.substring(0, 40)}${state.videoTitle.length > 40 ? '...' : ''}" worth your time?`
                  : 'Was this video worth your time?'
                }
              </div>
              <div className="rating-buttons">
                <button 
                  className="rating-btn productive"
                  onClick={() => handleRate(1)}
                >
                  👍 Yes
                </button>
                <button 
                  className="rating-btn neutral"
                  onClick={() => handleRate(0)}
                >
                  😐 Meh
                </button>
                <button 
                  className="rating-btn unproductive"
                  onClick={() => handleRate(-1)}
                >
                  👎 No
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
