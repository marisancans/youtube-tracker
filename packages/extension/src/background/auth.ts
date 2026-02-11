/**
 * Google Authentication
 */

import { getStorage, saveStorage, type AuthState, type GoogleUser } from './storage';

let authState: AuthState = {
  user: null,
  token: null,
  expiresAt: null,
};

// ===== Token Management =====

async function getAuthToken(interactive: boolean = false): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        console.log('[YT Detox] Auth error:', chrome.runtime.lastError.message);
        resolve(null);
        return;
      }
      resolve(token || null);
    });
  });
}

async function fetchGoogleUserInfo(token: string): Promise<GoogleUser | null> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      console.error('[YT Detox] Failed to fetch user info:', response.status);
      return null;
    }

    const data = await response.json();
    return {
      id: data.id,
      email: data.email,
      name: data.name,
      picture: data.picture,
    };
  } catch (err) {
    console.error('[YT Detox] Error fetching user info:', err);
    return null;
  }
}

// ===== Public API =====

export async function signIn(): Promise<{ success: boolean; user: GoogleUser | null; error?: string }> {
  try {
    const token = await getAuthToken(true); // interactive = true
    if (!token) {
      return { success: false, user: null, error: 'Failed to get auth token' };
    }

    const user = await fetchGoogleUserInfo(token);
    if (!user) {
      return { success: false, user: null, error: 'Failed to fetch user info' };
    }

    authState = {
      user,
      token,
      expiresAt: Date.now() + 3600 * 1000, // 1 hour
    };

    // Save to storage
    await chrome.storage.local.set({ authState });

    // Update settings with user ID and enable sync
    const storage = await getStorage();
    storage.settings.backend.userId = user.id;
    storage.settings.backend.enabled = true;
    await saveStorage({ settings: storage.settings });

    console.log('[YT Detox] Signed in as:', user.email);
    return { success: true, user };
  } catch (err) {
    console.error('[YT Detox] Sign in error:', err);
    return { success: false, user: null, error: String(err) };
  }
}

export async function signOut(): Promise<{ success: boolean }> {
  return new Promise((resolve) => {
    if (authState.token) {
      chrome.identity.removeCachedAuthToken({ token: authState.token }, async () => {
        authState = { user: null, token: null, expiresAt: null };
        await chrome.storage.local.remove('authState');

        // Clear user ID from settings
        const storage = await getStorage();
        storage.settings.backend.userId = null;
        await saveStorage({ settings: storage.settings });

        console.log('[YT Detox] Signed out');
        resolve({ success: true });
      });
    } else {
      resolve({ success: true });
    }
  });
}

export async function getAuthState(): Promise<AuthState> {
  // Check if we have a cached state
  const stored = await chrome.storage.local.get('authState');
  if (stored.authState) {
    authState = stored.authState;

    // Check if token is still valid (refresh if needed)
    if (authState.token && authState.expiresAt && Date.now() < authState.expiresAt) {
      return authState;
    }

    // Try to silently refresh
    const token = await getAuthToken(false);
    if (token) {
      const user = await fetchGoogleUserInfo(token);
      if (user) {
        authState = {
          user,
          token,
          expiresAt: Date.now() + 3600 * 1000,
        };
        await chrome.storage.local.set({ authState });
        return authState;
      }
    }

    // Token expired and couldn't refresh
    authState = { user: null, token: null, expiresAt: null };
  }

  return authState;
}

// ===== Initialization =====

export async function initAuth(): Promise<void> {
  const state = await getAuthState();
  if (state.user) {
    console.log('[YT Detox] Restored auth state for:', state.user.email);
  }
}
