/**
 * YouTube Tab Tracking
 */

// ===== Tab Info Types =====

export interface TabInfo {
  id: number;
  url: string;
  openedAt: number;
  closedAt?: number;
  activeDuration: number;
  lastActiveAt?: number;
}

export interface TabEvent {
  type: 'open' | 'close' | 'activate' | 'deactivate';
  tabId: number;
  url?: string;
  timestamp: number;
  totalYouTubeTabs: number;
}

export interface TabState {
  youtubeTabs: Map<number, TabInfo>;
  activeTabId: number | null;
  tabEvents: TabEvent[];
}

// ===== State =====

const tabState: TabState = {
  youtubeTabs: new Map(),
  activeTabId: null,
  tabEvents: [],
};

// ===== Helpers =====

export function isYouTubeUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.includes('youtube.com') || url.includes('youtu.be');
}

async function getYouTubeTabCount(): Promise<number> {
  const tabs = await chrome.tabs.query({ url: ['*://*.youtube.com/*', '*://youtu.be/*'] });
  return tabs.length;
}

// ===== Public API =====

export function getTabState(): {
  youtubeTabs: number;
  activeTabId: number | null;
  recentEvents: TabEvent[];
} {
  return {
    youtubeTabs: tabState.youtubeTabs.size,
    activeTabId: tabState.activeTabId,
    recentEvents: tabState.tabEvents.slice(-20),
  };
}

// ===== Event Handlers =====

export async function handleTabCreated(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id && isYouTubeUrl(tab.pendingUrl || tab.url)) {
    const tabInfo: TabInfo = {
      id: tab.id,
      url: tab.pendingUrl || tab.url || '',
      openedAt: Date.now(),
      activeDuration: 0,
    };
    tabState.youtubeTabs.set(tab.id, tabInfo);

    const totalTabs = await getYouTubeTabCount();
    tabState.tabEvents.push({
      type: 'open',
      tabId: tab.id,
      url: tabInfo.url,
      timestamp: Date.now(),
      totalYouTubeTabs: totalTabs,
    });

    console.log(`[YT Detox] YouTube tab opened. Total: ${totalTabs}`);
  }
}

export async function handleTabUpdated(
  tabId: number,
  changeInfo: chrome.tabs.TabChangeInfo,
  _tab: chrome.tabs.Tab,
): Promise<void> {
  if (changeInfo.url) {
    const wasYouTube = tabState.youtubeTabs.has(tabId);
    const isYouTube = isYouTubeUrl(changeInfo.url);

    if (!wasYouTube && isYouTube) {
      // Navigated TO YouTube
      const tabInfo: TabInfo = {
        id: tabId,
        url: changeInfo.url,
        openedAt: Date.now(),
        activeDuration: 0,
      };
      tabState.youtubeTabs.set(tabId, tabInfo);

      const totalTabs = await getYouTubeTabCount();
      tabState.tabEvents.push({
        type: 'open',
        tabId,
        url: changeInfo.url,
        timestamp: Date.now(),
        totalYouTubeTabs: totalTabs,
      });
      console.log(`[YT Detox] Navigated to YouTube. Total tabs: ${totalTabs}`);
    } else if (wasYouTube && !isYouTube) {
      // Navigated AWAY from YouTube
      const tabInfo = tabState.youtubeTabs.get(tabId);
      if (tabInfo) {
        tabInfo.closedAt = Date.now();
        tabState.youtubeTabs.delete(tabId);

        const totalTabs = await getYouTubeTabCount();
        tabState.tabEvents.push({
          type: 'close',
          tabId,
          timestamp: Date.now(),
          totalYouTubeTabs: totalTabs,
        });
        console.log(`[YT Detox] Navigated away from YouTube. Total tabs: ${totalTabs}`);
      }
    }
  }
}

export async function handleTabRemoved(tabId: number): Promise<void> {
  if (tabState.youtubeTabs.has(tabId)) {
    const tabInfo = tabState.youtubeTabs.get(tabId);
    if (tabInfo) {
      tabInfo.closedAt = Date.now();
    }
    tabState.youtubeTabs.delete(tabId);

    // Need to count manually since tab is already gone
    const totalTabs = tabState.youtubeTabs.size;
    tabState.tabEvents.push({
      type: 'close',
      tabId,
      timestamp: Date.now(),
      totalYouTubeTabs: totalTabs,
    });
    console.log(`[YT Detox] YouTube tab closed. Remaining: ${totalTabs}`);
  }
}

export async function handleTabActivated(activeInfo: chrome.tabs.TabActiveInfo): Promise<void> {
  const { tabId } = activeInfo;

  // Deactivate previous tab
  if (tabState.activeTabId && tabState.youtubeTabs.has(tabState.activeTabId)) {
    const prevTab = tabState.youtubeTabs.get(tabState.activeTabId);
    if (prevTab && prevTab.lastActiveAt) {
      prevTab.activeDuration += Date.now() - prevTab.lastActiveAt;
      prevTab.lastActiveAt = undefined;
    }

    tabState.tabEvents.push({
      type: 'deactivate',
      tabId: tabState.activeTabId,
      timestamp: Date.now(),
      totalYouTubeTabs: tabState.youtubeTabs.size,
    });
  }

  // Activate new tab if it's YouTube
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab && isYouTubeUrl(tab.url)) {
    if (!tabState.youtubeTabs.has(tabId)) {
      // Tab wasn't tracked yet (might have been opened before extension)
      tabState.youtubeTabs.set(tabId, {
        id: tabId,
        url: tab.url || '',
        openedAt: Date.now(),
        activeDuration: 0,
        lastActiveAt: Date.now(),
      });
    } else {
      const tabInfo = tabState.youtubeTabs.get(tabId);
      if (tabInfo) {
        tabInfo.lastActiveAt = Date.now();
      }
    }

    tabState.tabEvents.push({
      type: 'activate',
      tabId,
      url: tab.url,
      timestamp: Date.now(),
      totalYouTubeTabs: tabState.youtubeTabs.size,
    });

    tabState.activeTabId = tabId;
    console.log(`[YT Detox] YouTube tab activated. Total: ${tabState.youtubeTabs.size}`);
  } else {
    tabState.activeTabId = null;
  }
}

// ===== Initialize =====

export async function initTabs(): Promise<void> {
  // Scan for existing YouTube tabs on startup
  const existingTabs = await chrome.tabs.query({ url: ['*://*.youtube.com/*', '*://youtu.be/*'] });
  for (const tab of existingTabs) {
    if (tab.id) {
      tabState.youtubeTabs.set(tab.id, {
        id: tab.id,
        url: tab.url || '',
        openedAt: Date.now(), // We don't know actual open time
        activeDuration: 0,
      });
    }
  }
  console.log(`[YT Detox] Found ${existingTabs.length} existing YouTube tabs`);
}

// ===== Register Listeners =====

export function registerTabListeners(): void {
  chrome.tabs.onCreated.addListener(handleTabCreated);
  chrome.tabs.onUpdated.addListener(handleTabUpdated);
  chrome.tabs.onRemoved.addListener(handleTabRemoved);
  chrome.tabs.onActivated.addListener(handleTabActivated);
}
