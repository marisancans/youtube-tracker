/**
 * Update Checker — checks GitHub Releases API for new versions.
 * Uses chrome.alarms (survives MV3 service worker suspension).
 */

const GITHUB_REPO = 'marisancans/youtube-tracker';
const ALARM_NAME = 'checkForUpdates';
const CHECK_INTERVAL_MINUTES = 360; // 6 hours
const NOTIFICATION_ID = 'yt-detox-update';

interface UpdateState {
  lastChecked: number;
  latestVersion: string | null;
  downloadUrl: string | null;
  dismissedVersion: string | null;
}

const DEFAULT_UPDATE_STATE: UpdateState = {
  lastChecked: 0,
  latestVersion: null,
  downloadUrl: null,
  dismissedVersion: null,
};

async function getUpdateState(): Promise<UpdateState> {
  const result = await chrome.storage.local.get('updateState');
  return { ...DEFAULT_UPDATE_STATE, ...result.updateState };
}

async function saveUpdateState(partial: Partial<UpdateState>): Promise<void> {
  const current = await getUpdateState();
  await chrome.storage.local.set({ updateState: { ...current, ...partial } });
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function checkForUpdates(): Promise<void> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers: { Accept: 'application/vnd.github.v3+json' } },
    );

    if (!response.ok) {
      console.log('[YT Detox] Update check failed:', response.status);
      return;
    }

    const release = await response.json();
    const latestVersion = (release.tag_name as string).replace(/^v/, '');
    const currentVersion = chrome.runtime.getManifest().version;

    await saveUpdateState({
      lastChecked: Date.now(),
      latestVersion,
      downloadUrl: release.html_url,
    });

    if (compareVersions(latestVersion, currentVersion) > 0) {
      const state = await getUpdateState();
      // Don't nag if user already dismissed this version
      if (state.dismissedVersion === latestVersion) return;

      const zipAsset = (release.assets as any[])?.find(
        (a: any) => a.name.endsWith('.zip'),
      );

      chrome.notifications.create(NOTIFICATION_ID, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: `YouTube Detox v${latestVersion} available`,
        message: `You're on v${currentVersion}. Click to download the update.`,
        buttons: [
          { title: 'Download' },
          { title: 'Dismiss' },
        ],
        priority: 1,
      });

      // Store download URL for notification click
      await saveUpdateState({
        downloadUrl: zipAsset?.browser_download_url || release.html_url,
      });
    }

    console.log('[YT Detox] Update check complete. Current:', currentVersion, 'Latest:', latestVersion);
  } catch (err) {
    console.log('[YT Detox] Update check error:', err);
  }
}

export function handleUpdateAlarm(alarm: chrome.alarms.Alarm): boolean {
  if (alarm.name !== ALARM_NAME) return false;
  checkForUpdates();
  return true;
}

export async function handleUpdateNotificationClick(
  notificationId: string,
  buttonIndex: number,
): Promise<boolean> {
  if (notificationId !== NOTIFICATION_ID) return false;

  if (buttonIndex === 0) {
    // Download
    const state = await getUpdateState();
    if (state.downloadUrl) {
      chrome.tabs.create({ url: state.downloadUrl });
    }
  } else {
    // Dismiss — remember this version so we don't nag again
    const state = await getUpdateState();
    if (state.latestVersion) {
      await saveUpdateState({ dismissedVersion: state.latestVersion });
    }
  }

  chrome.notifications.clear(NOTIFICATION_ID);
  return true;
}

export function startUpdateChecker(): void {
  // Fire 1 minute after startup, then every 6 hours
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 1,
    periodInMinutes: CHECK_INTERVAL_MINUTES,
  });
  console.log('[YT Detox] Update checker started');
}

export { checkForUpdates };
