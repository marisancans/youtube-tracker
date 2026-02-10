import { safeSendMessage } from '../lib/messaging';

/**
 * Music Detection
 *
 * Determines if the current video/channel is music content
 * to exempt it from drift in Music Mode.
 */

interface MusicDetectionResult {
  isMusic: boolean;
  confidence: number; // 0-1
  reasons: string[];
}

// Keywords that indicate music content
const MUSIC_TITLE_KEYWORDS = [
  'official video',
  'official audio',
  'official music',
  'music video',
  'lyrics',
  'lyric video',
  'official lyric',
  'audio only',
  'visualizer',
  'official visualizer',
  'live performance',
  'concert',
  'acoustic',
  'cover song',
  'remix',
  'instrumental',
  'karaoke',
  'nightcore',
  'slowed',
  'reverb',
  'lofi',
  'lo-fi',
  'chill beats',
  'study music',
  'relaxing music',
  'sleep music',
  'meditation music',
  'ambient',
];

const MUSIC_CHANNEL_KEYWORDS = [
  'vevo',
  'records',
  'music',
  'official',
  'band',
  'artist',
  'lofi',
  'chillhop',
  'mrsuicidesheep',
  'proximity',
  'trap nation',
  'bass nation',
  'chill nation',
  'selected',
  'monstercat',
  'spinnin',
  'ultra music',
  'ncs',
  'no copyright sounds',
  'audio library',
  'epidemic sound',
];

// Known music channels (manually curated)
const KNOWN_MUSIC_CHANNELS = [
  'lofi girl',
  'chillhop music',
  'the bootleg boy',
  'college music',
  'mrsuicidesheep',
  'trap nation',
  'bass nation',
  'chill nation',
  'proximity',
  'monstercat',
  'spinnin records',
  'ultra music',
  'armada music',
  'ncs',
  'vevo',
  'audio library',
];

// Categories that indicate music
const MUSIC_CATEGORIES = [
  'music',
  'entertainment', // Often contains music
];

/**
 * Detect if current content is music
 */
export function detectMusic(): MusicDetectionResult {
  const reasons: string[] = [];
  let score = 0;
  const maxScore = 100;
  
  // Get page info
  const title = document.title.toLowerCase();
  const channelElement = document.querySelector('ytd-channel-name a, .ytd-channel-name a, #owner-name a, #channel-name a');
  const channelName = channelElement?.textContent?.toLowerCase().trim() || '';
  
  // Get video category from meta tags
  const categoryMeta = document.querySelector('meta[itemprop="genre"]');
  const category = categoryMeta?.getAttribute('content')?.toLowerCase() || '';
  
  // Get video description
  const descriptionElement = document.querySelector('#description-inline-expander, #description');
  const description = descriptionElement?.textContent?.toLowerCase() || '';
  
  // Check title for music keywords
  for (const keyword of MUSIC_TITLE_KEYWORDS) {
    if (title.includes(keyword)) {
      score += 20;
      reasons.push(`Title contains "${keyword}"`);
      break; // Only count once
    }
  }
  
  // Check channel name
  for (const keyword of MUSIC_CHANNEL_KEYWORDS) {
    if (channelName.includes(keyword)) {
      score += 25;
      reasons.push(`Channel contains "${keyword}"`);
      break;
    }
  }
  
  // Check known music channels
  for (const channel of KNOWN_MUSIC_CHANNELS) {
    if (channelName.includes(channel)) {
      score += 40;
      reasons.push(`Known music channel: ${channel}`);
      break;
    }
  }
  
  // Check category
  if (MUSIC_CATEGORIES.includes(category)) {
    score += 30;
    reasons.push(`Category: ${category}`);
  }
  
  // Check for music-related hashtags in title/description
  const hashtagRegex = /#(music|song|lyrics|remix|official|vevo|beats|lofi|chill)/gi;
  if (hashtagRegex.test(title) || hashtagRegex.test(description.slice(0, 500))) {
    score += 15;
    reasons.push('Music-related hashtags');
  }
  
  // Check for duration (music videos are typically 2-7 minutes)
  const durationElement = document.querySelector('.ytp-time-duration');
  const durationText = durationElement?.textContent || '';
  const durationMatch = durationText.match(/(\d+):(\d+)/);
  if (durationMatch) {
    const minutes = parseInt(durationMatch[1]);
    const seconds = parseInt(durationMatch[2]);
    const totalSeconds = minutes * 60 + seconds;
    
    if (totalSeconds >= 120 && totalSeconds <= 420) {
      // 2-7 minutes is typical for songs
      score += 10;
      reasons.push('Typical song duration');
    }
  }
  
  // Check for playlist context
  const playlistTitle = document.querySelector('yt-formatted-string.ytd-playlist-panel-renderer')?.textContent?.toLowerCase() || '';
  if (playlistTitle.includes('music') || playlistTitle.includes('playlist') || playlistTitle.includes('mix')) {
    score += 15;
    reasons.push('In music playlist');
  }
  
  // Check for YouTube Music branding
  if (document.querySelector('[data-ytmusic-client-name]') || window.location.hostname === 'music.youtube.com') {
    score += 50;
    reasons.push('YouTube Music');
  }
  
  // Normalize score
  const confidence = Math.min(score / maxScore, 1);
  const isMusic = confidence >= 0.4; // 40% confidence threshold
  
  return {
    isMusic,
    confidence,
    reasons,
  };
}

/**
 * Check if a channel is in the whitelist
 */
export function isChannelWhitelisted(channelName: string, whitelist: string[]): boolean {
  const normalized = channelName.toLowerCase().trim();
  return whitelist.some(w => normalized.includes(w.toLowerCase()));
}

/**
 * Get the current channel name
 */
export function getCurrentChannelName(): string | null {
  const channelElement = document.querySelector('ytd-channel-name a, .ytd-channel-name a, #owner-name a, #channel-name a');
  return channelElement?.textContent?.trim() || null;
}

/**
 * Initialize music detection and report to background
 */
export function initMusicDetection(): void {
  // Run detection when video changes
  const observer = new MutationObserver(() => {
    const result = detectMusic();
    safeSendMessage('MUSIC_DETECTED', result);
  });

  // Observe video player changes
  const playerContainer = document.querySelector('#movie_player, #player');
  if (playerContainer) {
    observer.observe(playerContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    });
  }

  // Initial detection
  setTimeout(() => {
    const result = detectMusic();
    safeSendMessage('MUSIC_DETECTED', result);
    console.log('[YT Detox] Music detection:', result);
  }, 2000);
}
