// Round 184e: Halaman test setup HPP documents
// Path: app/(app)/admin/hpp-test/page.jsx
//
// Buka URL: https://your-domain/admin/hpp-test
// Halaman ini bakal langsung cek semua prasyarat & test upload

import HPPTestClient from './HPPTestClient';
import { checkHPPSetup } from '@/lib/actions/hpp-test';

export const dynamic = 'force-dynamic';

export default async function HPPTestPage() {
  // Initial check di server (fast)
  let initialStatus = null;
  try { initialStatus = await checkHPPSetup(); } catch (e) {
    initialStatus = { errors: [String(e?.message || 'unknown')] };
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-brand-700">🧪 HPP Documents Setup Test</h1>
      <p className="text-sm text-slate-600 mt-1">Cek apakah SQL R184 udah jalan & upload bisa kerja</p>

      <HPPTestClient initialStatus={initialStatus} />
    </div>
  );
}
