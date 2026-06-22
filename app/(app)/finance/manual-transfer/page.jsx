// Finance — verifikasi bukti Transfer Bank Manual dari etalase web.
// Approve -> peserta auto masuk Master Trip + participant_payments (checklist payment).

import Link from 'next/link';
import { getManualTransfers } from '@/lib/shop/data';
import SignedFileLink from '@/components/common/SignedFileLink';
import ManualTransferActions from '@/components/finance/ManualTransferActions';

export const dynamic = 'force-dynamic';

function fmtRp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
function fmtDateTime(d) { if (!d) return '-'; try { return new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return d; } }

export default async function ManualTransferFinancePage() {
  const rows = await getManualTransfers({ limit: 150 });
  const pending = rows.filter((r) => r.manual_status === 'pending' && r.status !== 'paid');
  const done = rows.filter((r) => !(r.manual_status === 'pending' && r.status !== 'paid'));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/finance" className="text-sm text-slate-500 hover:underline">← Finance</Link>
          <h1 className="text-3xl font-bold text-brand-700 mt-1">Transfer Manual Web</h1>
          <p className="text-slate-600 mt-1">Verifikasi bukti transfer dari customer. Approve = peserta otomatis masuk Master Trip + checklist payment.</p>
        </div>
        <span className="shrink-0 px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-sm font-bold">{pending.length} menunggu</span>
      </div>

      {/* Menunggu verifikasi */}
      <section>
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Menunggu Verifikasi</h2>
        {pending.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">Tidak ada bukti transfer yang menunggu 🎉</div>
        ) : (
          <div className="space-y-3">
            {pending.map((b) => (
              <div key={b.id} className="bg-white border border-amber-200 rounded-xl shadow-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{b.lead_name} <span className="text-xs font-normal text-slate-500">· {b.lead_phone}</span></p>
                    <p className="text-sm text-slate-600">{b.trip?.name || '-'} {b.trip?.kode_trip ? `(${b.trip.kode_trip})` : ''}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Order #{b.order_code} · {b.pax_count ? '' : ''}{b.payment_type === 'full' ? 'Lunas' : 'DP'} · upload {fmtDateTime(b.proof_submitted_at)}</p>
                    {b.manual_note && <p className="text-xs italic text-slate-700 mt-1">"{b.manual_note}"</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-extrabold text-slate-900">{fmtRp(b.amount)}</p>
                    {b.payment_proof_url && (
                      <SignedFileLink url={b.payment_proof_url}
                        className="inline-block mt-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-xs font-semibold rounded cursor-pointer">
                        📎 Lihat Bukti
                      </SignedFileLink>
                    )}
                  </div>
                </div>
                <ManualTransferActions bookingId={b.id} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Riwayat */}
      {done.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Riwayat</h2>
          <div className="space-y-2">
            {done.map((b) => (
              <div key={b.id} className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <span className="font-semibold text-slate-800">{b.lead_name}</span>
                  <span className="text-slate-500"> · {b.trip?.name || '-'} · #{b.order_code}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-700">{fmtRp(b.amount)}</span>
                  {b.payment_proof_url && (
                    <SignedFileLink url={b.payment_proof_url} className="text-xs text-slate-500 hover:underline cursor-pointer">📎 Bukti</SignedFileLink>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    b.status === 'paid' || b.manual_status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                    b.manual_status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                    {b.status === 'paid' || b.manual_status === 'approved' ? '✓ Approved' : b.manual_status === 'rejected' ? '✕ Ditolak' : b.manual_status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
