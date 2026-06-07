// R184h + R222: next.config.js — bodySizeLimit + security headers + Sentry wrap
// Path: next.config.js (root project)
// R222 changes:
//   - Wrap dgn withSentryConfig (source map upload + error tracking)
//   - Update X-Frame-Options DENY → SAMEORIGIN (biar bisa embed iframe sendiri)
//   - Add Permissions-Policy (block camera/mic/geolocation)
//   - HSTS extended ke 2 tahun + preload

import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,

  // R184h: increase body limit untuk server actions (default 1MB → 10MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
    ];
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  productionBrowserSourceMaps: false,
};

// R222: wrap dgn Sentry buat source map upload + error tracking
export default withSentryConfig(nextConfig, {
  // Sentry org & project (set di env vars Vercel)
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Silent kalau gak CI
  silent: !process.env.CI,

  // Upload source maps dari semua chunks
  widenClientFileUpload: true,

  // Hide source maps di public (cuma Sentry yg punya)
  hideSourceMaps: true,

  // Disable Sentry logger di console
  disableLogger: true,

  // Auto inject Vercel cron monitor
  automaticVercelMonitors: true,
});
