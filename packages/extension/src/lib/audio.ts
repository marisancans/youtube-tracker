// Audio manager for pirate map feature.
// Provides ambient ocean loop, ship bell for drift ratings,
// and UI click sounds for island interactions.

export type SoundId = 'ambient' | 'bell' | 'click';

interface AudioState {
  muted: boolean;
  baseVolume: number;
  weatherMultiplier: number;
}

const AUDIO_FILES: Record<SoundId, string> = {
  ambient: 'src/assets/audio/ambient-ocean.mp3',
  bell: 'src/assets/audio/ship-bell.mp3',
  click: 'src/assets/audio/ui-click.mp3',
};

const state: AudioState = {
  muted: false,
  baseVolume: 0.3,
  weatherMultiplier: 1.0,
};

const elements = new Map<SoundId, HTMLAudioElement>();
const fadeTimers = new Map<SoundId, number>();

/** Resolve the correct URL for an audio file depending on execution context. */
function getAudioUrl(id: SoundId): string {
  const path = AUDIO_FILES[id];
  // Content scripts need chrome.runtime.getURL; options page can use relative paths
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }
  return `/${path}`;
}

/** Lazily create (or return existing) HTMLAudioElement for a sound. */
function getOrCreateAudio(id: SoundId): HTMLAudioElement {
  const existing = elements.get(id);
  if (existing) return existing;

  const audio = new Audio(getAudioUrl(id));
  audio.volume = 0;

  if (id === 'ambient') {
    audio.loop = true;
  }

  elements.set(id, audio);
  return audio;
}

/** Smoothly transition volume from current to target over durationMs. */
function fadeVolume(
  id: SoundId,
  targetVolume: number,
  durationMs: number,
): Promise<void> {
  return new Promise((resolve) => {
    const el = elements.get(id);
    if (!el) {
      resolve();
      return;
    }

    // Capture non-undefined reference for use in the closure
    const audio: HTMLAudioElement = el;

    // Clear any existing fade for this sound
    const existingTimer = fadeTimers.get(id);
    if (existingTimer != null) {
      cancelAnimationFrame(existingTimer);
      fadeTimers.delete(id);
    }

    const startVolume = audio.volume;
    const startTime = performance.now();
    const clampedTarget = Math.max(0, Math.min(1, targetVolume));

    function step() {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1);

      // Ease-in-out for smoother transitions
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      const currentVolume = startVolume + (clampedTarget - startVolume) * eased;
      audio.volume = Math.max(0, Math.min(1, currentVolume));

      if (progress < 1) {
        fadeTimers.set(id, requestAnimationFrame(step));
      } else {
        audio.volume = clampedTarget;
        fadeTimers.delete(id);
        resolve();
      }
    }

    if (durationMs <= 0) {
      audio.volume = clampedTarget;
      resolve();
    } else {
      fadeTimers.set(id, requestAnimationFrame(step));
    }
  });
}

/** Compute the effective volume for a sound. */
function effectiveVolume(): number {
  if (state.muted) return 0;
  return Math.max(0, Math.min(1, state.baseVolume * state.weatherMultiplier));
}

/** Start the ambient ocean loop with a 1-second fade-in. */
export async function startAmbient(): Promise<void> {
  const audio = getOrCreateAudio('ambient');
  audio.volume = 0;
  try {
    await audio.play();
  } catch {
    // Autoplay may be blocked; volume will stay at 0
    return;
  }
  await fadeVolume('ambient', effectiveVolume(), 1000);
}

/** Stop the ambient ocean loop with a 1-second fade-out, then pause. */
export async function stopAmbient(): Promise<void> {
  const audio = elements.get('ambient');
  if (!audio) return;

  await fadeVolume('ambient', 0, 1000);
  audio.pause();
  audio.currentTime = 0;
}

/** Play a one-shot sound (bell or click). */
export function playSound(id: SoundId): void {
  if (id === 'ambient') return; // Use startAmbient/stopAmbient instead
  if (state.muted) return;

  const audio = getOrCreateAudio(id);
  audio.volume = effectiveVolume();
  audio.currentTime = 0;
  audio.play().catch(() => {
    // Autoplay may be blocked — fail silently
  });
}

/** Adjust volume multiplier based on drift level. */
export function setWeatherIntensity(
  driftLevel: 'low' | 'medium' | 'high' | 'critical',
): void {
  const multipliers: Record<string, number> = {
    low: 0.8,
    medium: 1.0,
    high: 1.15,
    critical: 1.3,
  };

  state.weatherMultiplier = multipliers[driftLevel] ?? 1.0;

  // Apply immediately to ambient if it's playing
  const ambient = elements.get('ambient');
  if (ambient && !ambient.paused && !state.muted) {
    fadeVolume('ambient', effectiveVolume(), 500);
  }
}

/** Toggle mute state and persist to chrome.storage.local. */
export function toggleMute(): boolean {
  state.muted = !state.muted;

  // Apply immediately to all playing audio
  for (const [id, audio] of elements) {
    if (!audio.paused) {
      fadeVolume(id, state.muted ? 0 : effectiveVolume(), 300);
    }
  }

  // Persist preference
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ pirateMapMuted: state.muted });
    }
  } catch {
    // Storage may be unavailable — fail silently
  }

  return state.muted;
}

/** Check if audio is currently muted. */
export function isMuted(): boolean {
  return state.muted;
}

/** Load persisted mute preference from chrome.storage.local. */
export async function initAudio(): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const result = await chrome.storage.local.get('pirateMapMuted');
      if (typeof result.pirateMapMuted === 'boolean') {
        state.muted = result.pirateMapMuted;
      }
    }
  } catch {
    // Storage may be unavailable — default to unmuted
  }
}

/** Clean up all audio elements and timers. */
export function destroyAudio(): void {
  // Cancel all pending fades
  for (const timer of fadeTimers.values()) {
    cancelAnimationFrame(timer);
  }
  fadeTimers.clear();

  // Pause and remove all audio elements
  for (const audio of elements.values()) {
    audio.pause();
    audio.src = '';
    audio.load(); // Release resources
  }
  elements.clear();
}
