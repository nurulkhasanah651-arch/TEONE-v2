'use client';

// React Error Boundary — catch render errors + report ke Sentry
// Path: components/ErrorBoundary.jsx
// Usage:
//   import ErrorBoundary from '@/components/ErrorBoundary';
//   <ErrorBoundary><YourPage /></ErrorBoundary>

import { Component } from 'react';
import * as Sentry from '@sentry/nextjs';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    Sentry.captureException(error, {
      contexts: {
        react: { componentStack: errorInfo.componentStack },
      },
      tags: { boundary: this.props.name || 'unknown' },
    });
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const errMsg = this.state.error?.message || 'Unknown error';
      return (
        <div className="m-4 p-6 bg-red-50 border-2 border-red-300 rounded-xl">
          <p className="text-2xl mb-2">⚠</p>
          <h2 className="text-lg font-bold text-red-800 mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-red-700 mb-3">
            Halaman ini error. Tim kami sudah otomatis dapat notifikasi.
          </p>
          <details className="text-xs text-slate-600 mb-3">
            <summary className="cursor-pointer font-semibold">Error detail (technical)</summary>
            <pre className="mt-2 p-2 bg-white rounded border border-red-200 overflow-auto max-h-40 text-[10px] font-mono">
              {errMsg}
            </pre>
          </details>
          <div className="flex gap-2">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 bg-red-600 text-white text-sm font-bold rounded hover:bg-red-700"
            >
              🔄 Try Again
            </button>
            <button
              onClick={() => window.location.href = '/'}
              className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-semibold rounded hover:bg-slate-200"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
