// Runs in MAIN world — can see YouTube's custom events.
// Bridges yt-navigate-finish to the content script via postMessage.

document.addEventListener('yt-navigate-finish', () => {
  window.postMessage(
    { source: 'yt-detox-nav', type: 'navigate-finish', url: location.href },
    '*',
  );
});

document.addEventListener('yt-navigate-start', () => {
  window.postMessage(
    { source: 'yt-detox-nav', type: 'navigate-start', url: location.href },
    '*',
  );
});
