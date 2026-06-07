// Sentry server-side config (server actions, API routes, server components)
// Path: sentry.server.config.js

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0.1,
  debug: false,

  ignoreErrors: [
    'NEXT_NOT_FOUND',         // 404 not error
    'NEXT_REDIRECT',          // redirect not error
  ],

  beforeSend(event, hint) {
    // Strip sensitive env or DB connection strings
    if (event.extra) {
      delete event.extra.DATABASE_URL;
      delete event.extra.SUPABASE_SERVICE_ROLE_KEY;
      delete event.extra.META_USER_ACCESS_TOKEN;
      delete event.extra.META_PAGE_ACCESS_TOKEN;
    }
    return event;
  },

  initialScope: {
    tags: {
      component: 'server',
      app: 'teone-v2',
    },
  },
});
