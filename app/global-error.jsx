'use client';

// Global error boundary — jaring pengaman terakhir (termasuk error di root layout).
// Wajib me-render <html><body> sendiri karena menggantikan root layout saat error.
// Path: app/global-error.jsx

import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error('[Global Error]', error);
  }, [error]);

  return (
    <html lang="id">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#f8fafc', margin: 0 }}>
        <div style={{ maxWidth: 480, margin: '80px auto', padding: 24, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚠</div>
          <h1 style={{ fontSize: 20, color: '#1e293b', margin: '0 0 6px' }}>Ada gangguan sebentar</h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 20px' }}>
            Maaf, terjadi error. Datamu aman. Silakan muat ulang halaman.
          </p>
          <button onClick={() => reset()} style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            Muat ulang
          </button>
          {error?.digest && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 16, fontFamily: 'monospace' }}>Ref: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
