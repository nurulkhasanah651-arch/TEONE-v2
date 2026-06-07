// Safe server action wrapper — auto try-catch + Sentry capture + friendly error
// Path: lib/utils/safe-action.js
// Usage:
//   import { safeAction } from '@/lib/utils/safe-action';
//   export const myAction = safeAction(async (formData) => {
//     // your logic
//     return { ok: true };
//   });

import * as Sentry from '@sentry/nextjs';

/**
 * Wrap server action with error handling + Sentry capture.
 * Returns { ok: true, data } on success, { error: msg } on failure.
 */
export function safeAction(fn, options = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      const msg = err?.message || String(err);

      // Capture to Sentry with context
      Sentry.captureException(err, {
        tags: {
          action_name: options.name || fn.name || 'unknown',
        },
        extra: {
          args_count: args.length,
          // Don't log args (might have sensitive data)
        },
      });

      // Console log for Vercel logs
      console.error(`[safeAction] ${options.name || fn.name}:`, msg);

      // Return friendly error to client
      const userMsg = options.userMessage || msg;
      return { error: userMsg };
    }
  };
}

/**
 * Wrap server action that should never fail silently
 * (throws if error, useful for cron / background jobs)
 */
export function strictAction(fn, options = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      Sentry.captureException(err, {
        tags: { action_name: options.name || fn.name, strict: true },
      });
      throw err;
    }
  };
}

/**
 * Manual error capture
 * Usage: captureError(err, { context: 'extra info' })
 */
export function captureError(err, context = {}) {
  Sentry.captureException(err, { extra: context });
  console.error('[manual]', err?.message, context);
}

/**
 * Add user context to Sentry (call after login)
 */
export function setSentryUser(user) {
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({
    id: user.id,
    email: user.email,
    // Don't include sensitive data
  });
}
