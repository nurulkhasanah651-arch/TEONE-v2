'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resendWA, resendAllWA, dismissWA, clearOfflineMarkers } from '@/lib/actions/wa-outbox';

function fmt(s) { try { return new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return s; } }
const DEPT = { finance: '💰 Finance', cs: '📞 CS', visa: '🛂 Visa', ops: '🧭 Ops', tl: '🧭 TL' };

export default function WAPendingClient({ rows = [] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');

  function doResend(id) {
    setBusy(id); setMsg('');
    start(async () => {
      const r = await resendWA(id);
      setBusy(null);
      if (r?.error) setMsg('Gagal kirim ulang: ' + r.error);
      else { setMsg('✅ Terkirim.'); router.refresh(); }
    });
  }
  function doDismiss(id) {
    if (!confirm('Tandai selesai tanpa kirim (mis. nomor peserta memang salah)?')) return;
    setBusy(id);
    start(async () => { await dismissWA(id); setBusy(null); router.refresh(); });
  }
  function doConnected(context) {
    setBusy('conn-' + context); setMsg('');
    start(async () => {
      const r = await clearOfflineMarkers(context);
      setBusy(null);
      setMsg(r?.ok ? '✅ Ditandai tersambung — peringatan dibersihkan.' : ('Gagal: ' + (r?.error || '')));
      router.refresh();
    });
  }
  function doAll() {
    if (!confirm('Kirim ulang SEMUA pesan tertunda? Pastikan nomor Fonnte sudah login lagi.')) return;
    setBusy('all'); setMsg('');
    start(async () => {
      const r = await resendAllWA();
      setBusy(null);
      setMsg(r?.ok ? `Selesai: ${r.sent} terkirim, ${r.failed} masih gagal.` : ('Gagal: ' + (r?.error || '')));
      router.refresh();
    });
  }

  if (!rows.length) return <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 font-semibold">✅ Tidak ada pesan tertunda. Semua WA terkirim.</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <p className="text-sm font-bold text-red-700">{rows.length} pesan belum terkirim</p>
        <button onClick={doAll} disabled={pending} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50">
          {busy === 'all' && pending ? 'Mengirim…' : '🔁 Kirim Ulang Semua'}
        </button>
      </div>
      {msg && <p className="text-sm mb-3 text-slate-700">{msg}</p>}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-sm">
                <span className="font-bold text-slate-800">{DEPT[r.context] || r.context || '—'}{r.kind === 'device_offline' ? ' — NOMOR TERPUTUS' : ''}</span>
                <span className="text-slate-500"> · ke {r.target_phone || '-'} · {fmt(r.created_at)}</span>
              </div>
              <div className="flex gap-2">
                {r.kind !== 'device_offline' && (
                  <button onClick={() => doResend(r.id)} disabled={pending} className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50">
                    {busy === r.id && pending ? '…' : 'Kirim Ulang'}
                  </button>
                )}
                {r.kind === 'device_offline' && (
                  <button onClick={() => doConnected(r.context)} disabled={pending} className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50">
                    {busy === ('conn-' + r.context) && pending ? '…' : '✅ Sudah tersambung'}
                  </button>
                )}
                <button onClick={() => doDismiss(r.id)} disabled={pending} className="px-3 py-1 rounded border border-slate-300 text-slate-500 text-xs font-semibold disabled:opacity-50">Abaikan</button>
              </div>
            </div>
            {r.reason && <p className="text-[11px] text-red-500 mt-1">Alasan: {r.reason}</p>}
            <p className="text-xs text-slate-600 mt-1 whitespace-pre-line line-clamp-3 bg-slate-50 rounded p-2">{(r.message || '').slice(0, 300)}{(r.message || '').length > 300 ? '…' : ''}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
