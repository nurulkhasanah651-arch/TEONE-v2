// Next.js instrumentation hook — Sentry initialization
// Path: instrumentation.js

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export async function onRequestError(err, request, context) {
  const { captureRequestError } = await import('@sentry/nextjs');
  captureRequestError(err, request, context);
}
