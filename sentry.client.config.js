// Sentry client-side config (browser errors)
// Path: sentry.client.config.js

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Sample rate (1.0 = 100% of errors captured)
  tracesSampleRate: 0.1,        // 10% performance traces
  replaysSessionSampleRate: 0.0, // Session replay disabled (privacy)
  replaysOnErrorSampleRate: 1.0, // Capture replay on error (debugging)

  // Debug mode (set true for testing, false for production)
  debug: false,

  // Filter out noise
  ignoreErrors: [
    // Browser extension errors
    'top.GLOBALS',
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    // Network errors yg gak actionable
    'NetworkError',
    'Network request failed',
    // User cancel
    'AbortError',
  ],

  // Filter URLs (gak capture error dari extension)
  denyUrls: [
    /extensions\//i,
    /^chrome:\/\//i,
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
  ],

  // Mask sensitive data dari error context
  beforeSend(event, hint) {
    // Strip sensitive headers
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
      delete event.request.headers['x-supabase-auth'];
    }
    // Strip query params (mungkin ada token)
    if (event.request?.query_string) {
      const cleaned = String(event.request.query_string).replace(/token=[^&]+/g, 'token=***');
      event.request.query_string = cleaned;
    }
    return event;
  },

  // Tags untuk filter di Sentry UI
  initialScope: {
    tags: {
      component: 'client',
      app: 'teone-v2',
    },
  },
});
