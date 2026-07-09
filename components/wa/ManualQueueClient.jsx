'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { markManualWaSent } from '@/lib/actions/wa-manual';

const KIND_LABEL = {
  manual_pending_online: '💳 Pembayaran online',
  manual_pending_ongkir: '📦 Ongkir / pengiriman',
  manual_pending_reminder: '⏰ Reminder tagihan',
  manual_pending: '✉️ Lainnya',
};

function waLink(phone, message) {
  const p = String(phone || '').replace(/[^0-9]/g, '').replace(/^0/, '62');
  if (!p) return null;
  return `https://wa.me/${p}?text=${encodeURIComponent(message || '')}`;
}

function Row({ row }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState('');

  async function copy(text, tag) {
    try { await navigator.clipboard.writeText(text); setCopied(tag); }
    catch { alert('Gagal menyalin'); }
  }
  function done() {
    if (!confirm('Tandai pesan ini sudah dikirim manual?')) return;
    start(async () => {
      const r = await markManualWaSent(row.id);
      if (r?.error) alert(r.error); else router.refresh();
    });
  }

  const link = waLink(row.target_phone, row.message);
  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-white">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-slate-500">{KIND_LABEL[row.kind] || row.kind}</p>
          <p className="font-mono text-sm font-bold text-slate-800">{row.target_phone || '— tanpa nomor —'}</p>
          {(row.trip_kode || row.pic) && (
            <p className="text-[11px] text-slate-600 truncate">
              {row.trip_kode ? <span className="font-semibold">{row.trip_kode}</span> : null}
              {row.trip_name ? ` ${row.trip_name}` : ''}
              {row.pic ? <span className="ml-1 px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 font-bold">PIC {row.pic}</span> : null}
            </p>
          )}
          <p className="text-[11px] text-slate-400">{new Date(row.created_at).toLocaleString('id-ID')}</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {row.target_phone && (
            <button onClick={() => copy(row.target_phone, 'phone')}
              className="px-2.5 py-1 text-[11px] font-bold rounded bg-slate-200 hover:bg-slate-300 text-slate-800">
              {copied === 'phone' ? '✓ Nomor' : '📋 Nomor'}
            </button>
          )}
          <button onClick={() => copy(row.message || '', 'msg')}
            className="px-2.5 py-1 text-[11px] font-bold rounded bg-brand-600 hover:bg-brand-700 text-white">
            {copied === 'msg' ? '✓ Pesan' : '📋 Pesan'}
          </button>
          {link && (
            <a href={link} target="_blank" rel="noreferrer"
              className="px-2.5 py-1 text-[11px] font-bold rounded bg-green-600 hover:bg-green-700 text-white">
              💬 WhatsApp
            </a>
          )}
          <button onClick={done} disabled={pending}
            className="px-2.5 py-1 text-[11px] font-bold rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 disabled:opacity-50">
            {pending ? '…' : '✓ Sudah dikirim'}
          </button>
          <button onClick={() => setOpen((v) => !v)}
            className="px-2 py-1 text-[11px] rounded bg-slate-100 hover:bg-slate-200 text-slate-600">
            {open ? 'Tutup' : 'Lihat'}
          </button>
        </div>
      </div>
      {open && (
        <textarea readOnly rows={12} value={row.message || ''}
          onFocus={(e) => e.target.select()}
          className="mt-2 w-full text-xs font-mono border border-slate-300 rounded p-2 bg-slate-50" />
      )}
    </div>
  );
}

export default function ManualQueueClient({ pending = [], done = [], pics = [], scoped = false }) {
  const [pic, setPic] = useState('');
  const shown = pic ? pending.filter((r) => (r.pic || '') === pic) : pending;

  return (
    <div className="space-y-6">
      {!scoped && pics.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-500">Filter PIC:</span>
          <button onClick={() => setPic('')}
            className={`px-2.5 py-1 text-[11px] font-bold rounded ${!pic ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            Semua ({pending.length})
          </button>
          {pics.map((p) => {
            const n = pending.filter((r) => (r.pic || '') === p).length;
            return (
              <button key={p} onClick={() => setPic(p)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded ${pic === p ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                {p} ({n})
              </button>
            );
          })}
        </div>
      )}
      {scoped && (
        <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded px-3 py-1.5">
          Kamu login sebagai PIC — hanya antrean trip kamu yang ditampilkan.
        </p>
      )}

      <section>
        <h2 className="font-bold text-brand-700 mb-2">Menunggu dikirim ({shown.length})</h2>
        {shown.length === 0 ? (
          <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-lg p-4">
            Tidak ada antrean. Semua pesan sudah dikirim 🎉
          </p>
        ) : (
          <div className="space-y-2">{shown.map((r) => <Row key={r.id} row={r} />)}</div>
        )}
      </section>

      {done.length > 0 && (
        <section>
          <h2 className="font-bold text-slate-500 mb-2 text-sm">Sudah dikirim (50 terakhir)</h2>
          <div className="space-y-1">
            {done.map((r) => (
              <div key={r.id} className="text-xs text-slate-500 bg-white border border-slate-200 rounded px-3 py-1.5 flex justify-between gap-2">
                <span className="font-mono">{r.target_phone}</span>
                <span>{KIND_LABEL[r.kind] || r.kind}</span>
                <span>{r.sent_at ? new Date(r.sent_at).toLocaleString('id-ID') : '-'}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
