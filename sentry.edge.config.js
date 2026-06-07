// Sentry edge runtime config (middleware, edge functions)
// Path: sentry.edge.config.js

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
  initialScope: {
    tags: {
      component: 'edge',
      app: 'teone-v2',
    },
  },
});
