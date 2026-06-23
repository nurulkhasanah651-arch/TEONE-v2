'use client';

// ADDITIVE — panel kelola upload paspor via WA. Tidak mengubah daftar paspor existing.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  sendPassportUploadWA, sendPassportUploadWABulk,
  scanUploadedPassport, getPassportSignedUrl,
} from '@/lib/actions/passport-upload';

function fmt(s) {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }); } catch { return ''; }
}

export default function PassportUploadManager({ tripId, passengers = [] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [msg, setMsg] = useState('');
  const [actingId, setActingId] = useState(null);

  // group by family
  const families = {};
  const solos = [];
  for (const p of passengers) {
    if (p.familyId) { (families[p.familyId] ||= []).push(p); }
    else solos.push(p);
  }

  function notify(t) { setMsg(t); setTimeout(() => setMsg(''), 4000); }

  function kirim(headId) {
    setActingId('wa-' + headId);
    startTransition(async () => {
      const r = await sendPassportUploadWA(headId);
      setActingId(null);
      notify(r?.error ? `⚠ ${r.error}` : `✅ WA terkirim ke ${r.sentTo}`);
      if (r?.ok) router.refresh();
    });
  }
  function kirimSemua() {
    setActingId('bulk');
    startTransition(async () => {
      const r = await sendPassportUploadWABulk(tripId);
      setActingId(null);
      notify(r?.error ? `⚠ ${r.error}` : r.message);
      if (r?.ok) router.refresh();
    });
  }
  function scan(pid) {
    setActingId('scan-' + pid);
    startTransition(async () => {
      const r = await scanUploadedPassport(pid);
      setActingId(null);
      notify(r?.error ? `⚠ ${r.error}` : '✅ Data paspor ter-update dari hasil scan');
      if (r?.ok) router.refresh();
    });
  }
  async function lihat(pid) {
    setActingId('view-' + pid);
    const r = await getPassportSignedUrl(pid);
    setActingId(null);
    if (r?.url) window.open(r.url, '_blank');
    else notify(`⚠ ${r?.error || 'Gagal membuka file'}`);
  }

  function StatusBadge({ p }) {
    if (!p.uploaded) return <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-500">⏳ Belum upload</span>;
    if (p.autofilled) return <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">🤖 Auto-terisi {fmt(p.uploadedAt)}</span>;
    return <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">✅ Uploaded {fmt(p.uploadedAt)}</span>;
  }

  function MemberRow({ p }) {
    return (
      <div className="flex items-center justify-between gap-2 flex-wrap py-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-slate-700">{p.name}</span>
          <StatusBadge p={p} />
        </div>
        {p.uploaded && (
          <div className="flex gap-1.5">
            <button onClick={() => lihat(p.id)} disabled={busy} className="text-[11px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-50">{actingId === 'view-' + p.id ? '…' : '👁 Lihat'}</button>
            <button onClick={() => scan(p.id)} disabled={busy} className="text-[11px] px-2 py-1 rounded bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100 disabled:opacity-50">{actingId === 'scan-' + p.id ? 'Scan…' : '🔍 Scan ulang'}</button>
          </div>
        )}
      </div>
    );
  }

  function headOf(members) { return members.find((m) => m.isHead) || members[0]; }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-bold text-brand-700">📤 Upload Paspor via WA</p>
          <p className="text-[11px] text-slate-500">Kirim link upload ke peserta (per keluarga ke kepala keluarga). Saat peserta upload, data paspor terisi otomatis & bisa di-scan ulang.</p>
        </div>
        <button onClick={kirimSemua} disabled={busy} className="text-xs font-semibold px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-50">
          {actingId === 'bulk' ? 'Mengirim…' : '📤 Kirim ke Semua'}
        </button>
      </div>

      {msg && <div className="px-5 py-2 text-xs bg-amber-50 text-amber-800 border-b border-amber-100">{msg}</div>}

      <div className="divide-y divide-slate-100">
        {Object.entries(families).map(([fid, members]) => {
          const head = headOf(members);
          return (
            <div key={'f' + fid} className="px-5 py-3">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                <p className="text-xs font-bold text-slate-600">👨‍👩‍👧 Keluarga {head?.name} <span className="font-normal text-slate-400">({members.length} pax)</span></p>
                <button onClick={() => kirim(head.id)} disabled={busy} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50">
                  {actingId === 'wa-' + head.id ? 'Mengirim…' : '📤 Kirim WA (kepala kel.)'}
                </button>
              </div>
              <div className="pl-2">
                {members.map((m) => <MemberRow key={m.id} p={m} />)}
              </div>
            </div>
          );
        })}

        {solos.map((p) => (
          <div key={'s' + p.id} className="px-5 py-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-700">{p.name}</span>
                <StatusBadge p={p} />
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => kirim(p.id)} disabled={busy} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50">{actingId === 'wa-' + p.id ? 'Mengirim…' : '📤 Kirim WA'}</button>
                {p.uploaded && <>
                  <button onClick={() => lihat(p.id)} disabled={busy} className="text-[11px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-50">👁 Lihat</button>
                  <button onClick={() => scan(p.id)} disabled={busy} className="text-[11px] px-2 py-1 rounded bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100 disabled:opacity-50">{actingId === 'scan-' + p.id ? 'Scan…' : '🔍 Scan ulang'}</button>
                </>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
