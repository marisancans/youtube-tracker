// Error logging module — uses Sentry for cross-user error visibility.
// withErrorGuard provides resilience: a broken selector doesn't crash the tracker.

import * as Sentry from '@sentry/browser';

let initialized = false;

// TODO: Replace with your Sentry DSN from https://sentry.io
const SENTRY_DSN = '';

/** Initialize Sentry. Call once at content script startup. */
export function initErrorReporting(extensionVersion: string): void {
  if (initialized || !SENTRY_DSN) return;
  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      release: `yt-detox@${extensionVersion}`,
      environment: 'production',
      // Only capture our own errors, not YouTube's
      allowUrls: [/chrome-extension:\/\//],
      // Keep volume low
      sampleRate: 1.0,
      maxBreadcrumbs: 20,
      beforeSend(event) {
        // Strip any YouTube page URLs for privacy
        if (event.request?.url) {
          try {
            const url = new URL(event.request.url);
            event.request.url = `${url.origin}${url.pathname}`;
          } catch {
            // keep as-is
          }
        }
        return event;
      },
    });
    initialized = true;
  } catch {
    // If Sentry init fails, everything still works — errors just go to console
  }
}

/**
 * Log an error. Sends to Sentry (if initialized) and console.
 * Never throws.
 */
export function logError(message: string, source: string, stack?: string): void {
  try {
    console.error(`[YT Detox Error] [${source}]`, message);

    if (initialized) {
      const err = new Error(message);
      if (stack) err.stack = stack;
      Sentry.captureException(err, {
        tags: { source },
      });
    }
  } catch {
    // never throw
  }
}

/**
 * Wrap a function with try/catch error logging.
 * Works for both sync and async functions.
 * Returns a wrapper with the same signature.
 */
export function withErrorGuard<T extends (...args: any[]) => any>(fn: T, source: string): T {
  const wrapped = ((...args: any[]) => {
    try {
      const result = fn(...args);
      if (result instanceof Promise) {
        return result.catch((err: unknown) => {
          logError(String(err), source, (err as Error)?.stack);
        });
      }
      return result;
    } catch (err) {
      logError(String(err), source, (err as Error)?.stack);
    }
  }) as T;
  return wrapped;
}
