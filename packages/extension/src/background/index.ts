/**
 * Background Service Worker - Message Routing
 * All logic is in separate modules, this file handles message routing and initialization.
 */

import type { VideoSession, BrowserSession, Settings, Message, DailyStats } from '@yt-detox/shared';

// ===== Module Imports =====

import {
  getStorage,
  saveStorage,
  getTodayKey,
  DEFAULT_SETTINGS,
  EMPTY_EVENT_QUEUES,
  DEFAULT_SYNC_STATE,
} from './storage';

import { signIn, signOut, getAuthState, initAuth } from './auth';

import { getEmptyDailyStats, updateDailyStats, calculateBaselineStats, getWeeklySummary, getRolling24hStats } from './stats';

import {
  calculateDrift,
  getDriftLevel,
  getDriftEffectsAsync,
  getDriftState,
  getDriftV2State,
  getDriftSnapshots,
  initDrift,
  initDriftHistory,
  startDriftCalculation,
  addDriftSample,
} from './drift';

import { checkAndUpdatePhase, setPhase, initPhase } from './phase';

import {
  getChallengeProgress,
  upgradeTier,
  downgradeTier,
  awardXp,
  setGoalMode,
  setChallengeTier,
  startChallengeChecks,
  handleNotificationClick,
} from './challenge';

import { syncToBackend, queueEvents, getSyncStatus, startPeriodicSync, handleSyncAlarm, restoreFromBackend } from './sync';

import { getTabState, initTabs, registerTabListeners } from './tabs';

import {
  checkAchievements,
  getUnlockedAchievements,
  getAllAchievements,
  calculateStreak,
  initAchievements,
  startAchievementChecks,
} from './achievements';

import { startUpdateChecker, handleUpdateAlarm, handleUpdateNotificationClick, checkForUpdates } from './update-checker';

// ===== Page Event Handlers =====

async function handlePageLoad(data: any): Promise<void> {
  console.log('[YT Detox] Page load:', data.pageType, data.url);

  if (data.firstCheckTime) {
    const storage = await getStorage();
    const today = getTodayKey();

    if (!storage.dailyStats[today]) {
      storage.dailyStats[today] = getEmptyDailyStats(today);
    }

    if (!storage.dailyStats[today].firstCheckTime) {
      storage.dailyStats[today].firstCheckTime = data.firstCheckTime;
      await saveStorage({ dailyStats: storage.dailyStats });
    }
  }
}

async function handlePageUnload(data: {
  session: BrowserSession;
  events: Record<string, any[]>;
  temporal?: any;
}): Promise<void> {
  const storage = await getStorage();

  // Save browser session
  storage.browserSessions.push(data.session);
  if (storage.browserSessions.length > 100) {
    storage.browserSessions = storage.browserSessions.slice(-100);
  }

  await saveStorage({ browserSessions: storage.browserSessions });

  // Queue events
  await queueEvents(data.events);

  // Update daily stats
  const sessionsForStats = storage.videoSessions.filter(
    (s) => s.timestamp > data.session.startedAt && s.timestamp < (data.session.endedAt || Date.now()),
  );
  await updateDailyStats(data.session, sessionsForStats, data.temporal);

  // Trigger sync if backend enabled
  const settings = storage.settings;
  if (settings.backend.enabled) {
    const lastSync = settings.backend.lastSync || 0;
    const timeSinceSync = Date.now() - lastSync;
    const totalPending = Object.values(storage.pendingEvents).reduce((sum, arr) => sum + arr.length, 0);

    // Sync every 5 minutes or if queue is getting large
    if (timeSinceSync > 5 * 60 * 1000 || totalPending > 100) {
      syncToBackend();
    }
  }
}

async function handleVideoWatched(session: VideoSession): Promise<void> {
  const storage = await getStorage();

  storage.videoSessions.push(session);
  if (storage.videoSessions.length > 500) {
    storage.videoSessions = storage.videoSessions.slice(-500);
  }

  await saveStorage({ videoSessions: storage.videoSessions });
}

async function handleRateVideo(data: { sessionId: string; rating: -1 | 0 | 1 }): Promise<void> {
  const storage = await getStorage();

  const session = storage.videoSessions.find((s) => s.id === data.sessionId);
  if (session) {
    session.productivityRating = data.rating;
    session.ratedAt = Date.now();
    await saveStorage({ videoSessions: storage.videoSessions });
  }

  const today = getTodayKey();
  if (storage.dailyStats[today]) {
    storage.dailyStats[today].promptsAnswered++;
    if (data.rating === 1) storage.dailyStats[today].productiveVideos++;
    else if (data.rating === -1) storage.dailyStats[today].unproductiveVideos++;
    else storage.dailyStats[today].neutralVideos++;
    await saveStorage({ dailyStats: storage.dailyStats });
  }
}

async function handleGetStats(): Promise<{ today: DailyStats | null; currentSession: null }> {
  const rolling = await getRolling24hStats();
  return {
    today: rolling,
    currentSession: null,
  };
}

async function handleGetSettings(): Promise<Settings> {
  const storage = await getStorage();
  return storage.settings;
}

async function handleUpdateSettings(newSettings: Partial<Settings>): Promise<Settings> {
  const storage = await getStorage();
  storage.settings = { ...storage.settings, ...newSettings };
  await saveStorage({ settings: storage.settings });
  return storage.settings;
}

async function handlePromptShown(): Promise<void> {
  const storage = await getStorage();
  const today = getTodayKey();

  if (!storage.dailyStats[today]) {
    storage.dailyStats[today] = getEmptyDailyStats(today);
  }

  storage.dailyStats[today].promptsShown++;
  await saveStorage({ dailyStats: storage.dailyStats });
}

async function handleInterventionResponse(data: { type: string; response: string; effective: boolean }): Promise<void> {
  const storage = await getStorage();
  const today = getTodayKey();

  if (!storage.dailyStats[today]) {
    storage.dailyStats[today] = getEmptyDailyStats(today);
  }

  storage.dailyStats[today].interventionsShown++;
  if (data.effective) {
    storage.dailyStats[today].interventionsEffective++;
  }

  await saveStorage({ dailyStats: storage.dailyStats });
}

// ===== Main Message Handler =====

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  const { type, data } = message;

  (async () => {
    try {
      // Auth guard — only allow whitelisted messages without sign-in
      const AUTH_EXEMPT = new Set([
        'AUTH_SIGN_IN', 'AUTH_SIGN_OUT', 'AUTH_GET_STATE',
        'GET_SETTINGS', 'UPDATE_SETTINGS', 'OPEN_TAB',
        'CHECK_FOR_UPDATES',
      ]);

      if (!AUTH_EXEMPT.has(type)) {
        const auth = await getAuthState();
        if (!auth.user) {
          sendResponse({ error: 'AUTH_REQUIRED' });
          return;
        }
      }

      let response: any = { success: true };

      switch (type) {
        // Page events
        case 'PAGE_LOAD':
          await handlePageLoad(data);
          break;
        case 'PAGE_UNLOAD':
          await handlePageUnload(data as any);
          break;
        case 'VIDEO_WATCHED':
          await handleVideoWatched(data as VideoSession);
          break;
        case 'RATE_VIDEO':
          await handleRateVideo(data as any);
          break;

        // Stats
        case 'GET_STATS':
          response = await handleGetStats();
          break;
        case 'GET_WEEKLY_SUMMARY':
          response = await getWeeklySummary();
          break;
        case 'GET_BASELINE_STATS':
          response = await calculateBaselineStats();
          break;

        // Settings
        case 'GET_SETTINGS':
          response = await handleGetSettings();
          break;
        case 'UPDATE_SETTINGS':
          response = await handleUpdateSettings(data as Partial<Settings>);
          break;

        // Prompts/Interventions
        case 'PROMPT_SHOWN':
          await handlePromptShown();
          break;
        case 'INTERVENTION_RESPONSE':
          await handleInterventionResponse(data as any);
          break;

        // Session
        case 'GET_SESSION':
          response = { session: null };
          break;

        // Sync
        case 'SYNC_NOW':
          const syncResult = await syncToBackend();
          response = { success: syncResult };
          break;
        case 'GET_SYNC_STATUS':
          response = await getSyncStatus();
          break;
        case 'GET_PENDING_COUNTS': {
          const pendingStorage = await getStorage();
          response = {
            videoSessions: pendingStorage.videoSessions.length,
            browserSessions: pendingStorage.browserSessions.length,
            dailyStats: Object.keys(pendingStorage.dailyStats).length,
            scroll: pendingStorage.pendingEvents.scroll.length,
            thumbnail: pendingStorage.pendingEvents.thumbnail.length,
            page: pendingStorage.pendingEvents.page.length,
            video_watch: pendingStorage.pendingEvents.video_watch.length,
            recommendation: pendingStorage.pendingEvents.recommendation.length,
            intervention: pendingStorage.pendingEvents.intervention.length,
            mood: pendingStorage.pendingEvents.mood.length,
          };
          break;
        }

        // Auth
        case 'AUTH_SIGN_IN':
          response = await signIn();
          break;
        case 'AUTH_SIGN_OUT':
          response = await signOut();
          break;
        case 'AUTH_GET_STATE':
          response = await getAuthState();
          break;
        case 'RESTORE_DATA': {
          const restoreStorage = await getStorage();
          const restoreUserId = (data as any)?.userId || restoreStorage.settings.backend.userId || '';
          response = await restoreFromBackend(restoreUserId);
          break;
        }

        // Phase
        case 'GET_PHASE_INFO':
          response = await checkAndUpdatePhase();
          break;
        case 'SET_PHASE':
          response = await setPhase((data as any).phase);
          break;

        // Drift
        case 'GET_DRIFT':
          const { drift, factors } = await calculateDrift();
          const driftState = getDriftState();
          const driftEffects = await getDriftEffectsAsync(drift);
          response = {
            drift,
            factors,
            level: getDriftLevel(drift),
            effects: driftEffects,
            history: driftState.history,
          };
          break;
        case 'GET_DRIFT_HISTORY':
          response = getDriftSnapshots();
          break;
        case 'GET_DRIFT_EFFECTS':
          response = await getDriftEffectsAsync(getDriftState().current);
          break;
        case 'GET_DRIFT_V2':
          response = getDriftV2State();
          break;
        case 'DRIFT_BEHAVIOR_EVENT': {
          const evt = data as { axis: 'timePressure' | 'contentQuality' | 'behaviorPattern'; weight: number };
          if (evt?.axis && typeof evt.weight === 'number') {
            addDriftSample(evt.axis, evt.weight);
          }
          break;
        }

        // Challenge
        case 'GET_CHALLENGE_PROGRESS':
          response = await getChallengeProgress();
          break;
        case 'UPGRADE_TIER':
          response = await upgradeTier();
          break;
        case 'DOWNGRADE_TIER':
          response = await downgradeTier();
          break;
        case 'AWARD_XP':
          const awarded = await awardXp((data as any).baseXp, (data as any).reason);
          response = { awarded };
          break;
        case 'SET_CHALLENGE_TIER':
          const tierResult = await setChallengeTier((data as any).tier);
          const { drift: newDrift } = await calculateDrift();
          response = { ...tierResult, newDrift };
          break;
        case 'SET_GOAL_MODE':
          const modeResult = await setGoalMode((data as any).mode);
          const { drift: driftAfterMode } = await calculateDrift();
          response = { ...modeResult, newDrift: driftAfterMode };
          break;

        // Tabs
        case 'GET_TAB_INFO':
          response = getTabState();
          break;

        // Music detection
        case 'MUSIC_DETECTED':
          // Store music detection result for drift calculation
          await chrome.storage.local.set({
            currentContentIsMusic: (data as any)?.isMusic || false,
            musicDetectionConfidence: (data as any)?.confidence || 0,
          });
          console.log('[YT Detox] Music detected:', (data as any)?.isMusic, 'confidence:', (data as any)?.confidence);
          break;

        // Achievements
        case 'GET_ACHIEVEMENTS':
          response = {
            unlocked: await getUnlockedAchievements(),
            all: getAllAchievements(),
          };
          break;
        case 'CHECK_ACHIEVEMENTS':
          response = { newAchievements: await checkAchievements() };
          break;
        case 'GET_STREAK':
          response = { streak: await calculateStreak() };
          break;

        case 'STATS_UPDATE':
          await chrome.storage.local.set({
            liveSession: (data as any).session,
            liveTemporal: (data as any).temporal,
            liveSessionUpdatedAt: Date.now(),
          });
          break;

        case 'OPEN_TAB': {
          const tabData = data as { url?: string } | undefined;
          if (tabData?.url) {
            chrome.tabs.create({ url: tabData.url });
          }
          break;
        }

        // Update checker
        case 'CHECK_FOR_UPDATES': {
          await checkForUpdates();
          const updateResult = await chrome.storage.local.get('updateState');
          response = updateResult.updateState || {};
          break;
        }

        default:
          console.log('[YT Detox] Unknown message type:', type);
      }

      sendResponse(response);
    } catch (error) {
      console.error('[YT Detox] Message handler error:', error);
      sendResponse({ error: String(error) });
    }
  })();

  return true; // Keep channel open for async response
});

// ===== Alarms =====

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'syncToBackend') {
    await handleSyncAlarm();
  } else if (handleUpdateAlarm(alarm)) {
    // handled by update checker
  }
});

// ===== Notifications =====

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  const handled = await handleUpdateNotificationClick(notificationId, buttonIndex);
  if (!handled) {
    handleNotificationClick(notificationId, buttonIndex);
  }
});

// ===== Extension Icon Click =====

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// ===== Install/Update =====

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const settings = { ...DEFAULT_SETTINGS, installDate: Date.now() };
    await saveStorage({
      settings,
      videoSessions: [],
      browserSessions: [],
      dailyStats: {},
      pendingEvents: { ...EMPTY_EVENT_QUEUES },
      syncState: { ...DEFAULT_SYNC_STATE },
    });
    chrome.runtime.openOptionsPage();
  } else if (details.reason === 'update') {
    const storage = await getStorage();
    // Ensure new fields exist
    if (!storage.pendingEvents.intervention) {
      storage.pendingEvents.intervention = [];
    }
    if (!storage.pendingEvents.mood) {
      storage.pendingEvents.mood = [];
    }
    await saveStorage({ pendingEvents: storage.pendingEvents });
  }
});

// ===== Initialization =====

let periodicTasksStarted = false;

function startPeriodicTasks(): void {
  if (periodicTasksStarted) return;
  periodicTasksStarted = true;
  startDriftCalculation(30000);
  startChallengeChecks(60 * 60 * 1000);
  startPeriodicSync(5 * 60 * 1000);
  startAchievementChecks(60 * 60 * 1000);
  console.log('[YT Detox] Periodic tasks started');
}

async function initialize(): Promise<void> {
  console.log('[YT Detox] Initializing background service worker...');

  // Initialize modules
  await initAuth();
  await initDrift();
  await initDriftHistory();
  await initPhase();
  await initTabs();

  // Register tab listeners
  registerTabListeners();

  // Initialize achievements
  await initAchievements();

  // Only start periodic tasks if user is signed in
  const auth = await getAuthState();
  if (auth.user) {
    startPeriodicTasks();
  }

  // Start/stop periodic tasks when auth state changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.authState?.newValue?.user && !periodicTasksStarted) {
      startPeriodicTasks();
    }
  });

  // Start update checker (works without auth)
  startUpdateChecker();

  console.log('[YT Detox] Background service worker initialized (v0.6.0 - auth-required)');
}

// Run initialization
initialize();
