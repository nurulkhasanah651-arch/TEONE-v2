// /tl-assign/[token] — PUBLIC approval page (no auth required)
// TL klik link dari WA, langsung sampai sini

import Link from 'next/link';
import { createPublicClient as createClient } from '@/lib/supabase/server';
import { approveTLAssignment, rejectTLAssignment } from '@/lib/actions/tl-assign';
import { fmtDate } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function TLAssignTokenPage({ params, searchParams }) {
  const { token } = await params;
  const sp = await searchParams;
  const action = sp?.action || null;

  const supabase = createClient();
  const { data: trip } = await supabase
    .from('trips')
    .select('id, kode_trip, name, departure, arrival, sold, quota, tl_id, tl_name, tl_assignment_status, tl_assignment_decided_at, tl_assignment_reject_note')
    .eq('tl_assignment_token', token)
    .maybeSingle();

  if (!trip) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md bg-white rounded-2xl border border-red-200 shadow-xl p-8 text-center">
          <p className="text-4xl mb-2">❌</p>
          <h1 className="text-2xl font-bold text-red-700">Link Tidak Valid</h1>
          <p className="mt-2 text-slate-600">Token assignment tidak ditemukan atau sudah kadaluarsa.</p>
          <p className="text-xs text-slate-500 mt-3">Hubungi Ops untuk re-send notif.</p>
        </div>
      </main>
    );
  }

  // Already decided
  if (trip.tl_assignment_status === 'approved') {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-green-50">
        <div className="max-w-md bg-white rounded-2xl border-2 border-green-300 shadow-xl p-8 text-center">
          <p className="text-5xl mb-3">✅</p>
          <h1 className="text-2xl font-bold text-green-800">Sudah Approved</h1>
          <p className="mt-3 text-sm text-slate-700">
            Trip <strong>{trip.kode_trip || `#${trip.id}`} — {trip.name}</strong> sudah kamu approve.
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Diputuskan: {fmtDate(trip.tl_assignment_decided_at)}
          </p>
          <a href="/login" className="mt-5 inline-block px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-lg">
            Login ke Portal TL →
          </a>
        </div>
      </main>
    );
  }

  if (trip.tl_assignment_status === 'rejected') {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-red-50">
        <div className="max-w-md bg-white rounded-2xl border-2 border-red-300 shadow-xl p-8 text-center">
          <p className="text-5xl mb-3">❌</p>
          <h1 className="text-2xl font-bold text-red-800">Sudah Rejected</h1>
          <p className="mt-3 text-sm text-slate-700">
            Trip <strong>{trip.kode_trip || `#${trip.id}`}</strong> sudah kamu reject.
          </p>
          {trip.tl_assignment_reject_note && (
            <p className="text-xs text-slate-500 mt-2 italic">"{trip.tl_assignment_reject_note}"</p>
          )}
          <p className="text-xs text-slate-500 mt-3">Ops akan dapat notif & cari pengganti.</p>
        </div>
      </main>
    );
  }

  // Auto-execute action kalau ?action=approve atau ?action=reject
  if (action === 'approve') {
    const r = await approveTLAssignment(token);
    if (r.ok) {
      return (
        <main className="min-h-screen flex items-center justify-center p-6 bg-green-50">
          <div className="max-w-md bg-white rounded-2xl border-2 border-green-300 shadow-xl p-8 text-center">
            <p className="text-5xl mb-3">✅</p>
            <h1 className="text-2xl font-bold text-green-800">Approved!</h1>
            <p className="mt-3 text-sm text-slate-700">
              Terima kasih sudah approve trip <strong>{trip.kode_trip || `#${trip.id}`} — {trip.name}</strong>.
            </p>
            <p className="text-xs text-slate-600 mt-2">
              Trip akan muncul di Portal TL setelah kamu login.
            </p>
            <a href="/login" className="mt-5 inline-block px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-lg">
              Login ke Portal TL →
            </a>
          </div>
        </main>
      );
    }
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-red-50">
        <div className="max-w-md bg-white rounded-2xl border border-red-200 shadow-xl p-8 text-center">
          <p className="text-4xl mb-2">⚠</p>
          <h1 className="text-xl font-bold text-red-700">Error</h1>
          <p className="mt-2 text-slate-600">{r.error}</p>
        </div>
      </main>
    );
  }

  // Reject — show form for note
  if (action === 'reject') {
    return <RejectForm token={token} trip={trip} />;
  }

  // Default — show 2 buttons
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-8">
        <div className="text-center">
          <p className="text-4xl mb-2">👤</p>
          <h1 className="text-2xl font-bold text-brand-700">Penugasan Tour Leader</h1>
          <p className="text-xs text-slate-500 mt-1">TEONE — Traveling Eropa One System</p>
        </div>

        <div className="mt-6 p-4 bg-brand-50 rounded-lg border border-brand-200 space-y-1">
          <p className="text-xs font-mono font-bold text-brand-700">{trip.kode_trip || `#${trip.id}`}</p>
          <p className="text-lg font-bold text-slate-800">{trip.name}</p>
          <p className="text-sm text-slate-700">🛫 Berangkat: {fmtDate(trip.departure)}</p>
          <p className="text-sm text-slate-700">🛬 Pulang: {fmtDate(trip.arrival)}</p>
          <p className="text-sm text-slate-700">👥 Peserta: {trip.sold || 0}/{trip.quota || 0}</p>
        </div>

        <p className="mt-4 text-sm text-slate-700 text-center">
          Apakah kamu menerima penugasan ini?
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link
            href={`/tl-assign/${token}?action=approve`}
            className="block py-3 text-center bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg shadow-lg"
          >
            ✅ APPROVE
          </Link>
          <Link
            href={`/tl-assign/${token}?action=reject`}
            className="block py-3 text-center bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg shadow-lg"
          >
            ❌ REJECT
          </Link>
        </div>
      </div>
    </main>
  );
}

// Reject form — client component inline
function RejectForm({ token, trip }) {
  async function handleReject(formData) {
    'use server';
    const note = formData.get('note');
    const r = await rejectTLAssignment(token, note);
    if (r.ok) {
      // Redirect with state
      const { redirect } = await import('next/navigation');
      redirect(`/tl-assign/${token}`);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-red-50">
      <form action={handleReject} className="max-w-md w-full bg-white rounded-2xl border-2 border-red-300 shadow-xl p-8">
        <div className="text-center mb-5">
          <p className="text-4xl mb-2">❌</p>
          <h1 className="text-xl font-bold text-red-700">Konfirmasi Reject</h1>
          <p className="text-sm text-slate-600 mt-2">
            Trip: <strong>{trip.kode_trip || `#${trip.id}`} — {trip.name}</strong>
          </p>
        </div>

        <label className="block">
          <span className="text-sm font-bold text-slate-700">Alasan reject (opsional)</span>
          <textarea autoComplete="off"
            name="note"
            rows="3"
            placeholder="Misal: tanggal bentrok dengan trip lain, sakit, dll"
            className="mt-1 w-full px-3 py-2 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-red-500 outline-none"
          />
        </label>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link href={`/tl-assign/${token}`} className="block py-2.5 text-center bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded">
            ← Batal
          </Link>
          <button type="submit" className="py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded">
            Konfirmasi Reject
          </button>
        </div>

        <p className="text-[10px] text-slate-500 mt-3 text-center">
          Ops akan dapat notif untuk cari TL pengganti.
        </p>
      </form>
    </main>
  );
}
