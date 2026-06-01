'use client';

// Round 185: Section delivery perlengkapan untuk payment checklist trip
// Path: components/checklist/DeliverySection.jsx
//
// USAGE:
//   import DeliverySection from '@/components/checklist/DeliverySection';
//   <DeliverySection tripId={tripId} passengers={passengersWithCustomers} />

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  sendDeliveryLink,
  bulkSendDeliveryLinks,
  markDeliverySent,
  markDeliveryReceived,
  skipDelivery,
  resetDeliveryStatus,
} from '@/lib/actions/delivery';

function fmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_BADGE = {
  pending:  { label: '⏳ Belum Isi Alamat', cls: 'bg-slate-100 text-slate-700' },
  filled:   { label: '✓ Alamat OK',         cls: 'bg-amber-100 text-amber-700' },
  sent:     { label: '🚚 Sudah Dikirim',    cls: 'bg-blue-100 text-blue-700' },
  received: { label: '✅ Diterima',          cls: 'bg-green-100 text-green-700' },
  skip:     { label: '— Skip',              cls: 'bg-slate-100 text-slate-400' },
};

export default function DeliverySection({ tripId, passengers = [], appUrl = '' }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openSent, setOpenSent] = useState(null); // passengerId
  const [courier, setCourier] = useState('JNE');
  const [resi, setResi] = useState('');
  const [msg, setMsg] = useState(null);

  function flash(text, isErr = false) {
    setMsg({ text, isErr });
    setTimeout(() => setMsg(null), 6000);
  }

  // Stats
  const counts = { pending: 0, filled: 0, sent: 0, received: 0, skip: 0 };
  for (const p of passengers) {
    const s = p.delivery_status || 'pending';
    if (counts[s] != null) counts[s]++;
  }

  async function handleSendLink(id) {
    startTransition(async () => {
      const r = await sendDeliveryLink(id);
      if (r?.error) flash(r.error, true);
      else { flash(`✓ Link terkirim ke ${r.target}`); router.refresh(); }
    });
  }

  async function handleBulkSend() {
    if (counts.pending === 0) { flash('Semua peserta sudah isi alamat', true); return; }
    if (!confirm(`Kirim link alamat ke ${counts.pending} peserta yang belum isi?`)) return;
    startTransition(async () => {
      const r = await bulkSendDeliveryLinks(tripId);
      if (r?.error) flash(r.error, true);
      else { flash(r.message); router.refresh(); }
    });
  }

  async function handleSent(id) {
    if (!courier || !resi) { flash('Isi kurir + resi dulu', true); return; }
    const fd = new FormData();
    fd.append('courier', courier);
    fd.append('resi', resi);
    startTransition(async () => {
      const r = await markDeliverySent(id, fd);
      if (r?.error) flash(r.error, true);
      else {
        flash('✓ Marked dikirim + WA resi terkirim ke peserta');
        setOpenSent(null);
        setCourier('JNE');
        setResi('');
        router.refresh();
      }
    });
  }

  async function handleReceived(id) {
    if (!confirm('Konfirmasi peserta sudah terima perlengkapan?')) return;
    startTransition(async () => {
      const r = await markDeliveryReceived(id);
      if (r?.error) flash(r.error, true);
      else { flash('✓ Marked diterima'); router.refresh(); }
    });
  }

  async function handleSkip(id) {
    if (!confirm('Skip pengiriman untuk peserta ini?')) return;
    startTransition(async () => {
      const r = await skipDelivery(id);
      if (r?.error) flash(r.error, true);
      else { flash('✓ Skipped'); router.refresh(); }
    });
  }

  async function handleReset(id) {
    if (!confirm('Reset status ke "filled" (batalin sent/received)?')) return;
    startTransition(async () => {
      const r = await resetDeliveryStatus(id);
      if (r?.error) flash(r.error, true);
      else { flash('✓ Reset'); router.refresh(); }
    });
  }

  function copyLink(token) {
    const url = `${appUrl || window.location.origin}/delivery/${token}`;
    navigator.clipboard.writeText(url);
    flash('✓ Link disalin ke clipboard');
  }

  async function downloadExcel() {
    // Sederhana: bikin CSV + browser download
    const filled = passengers.filter((p) => p.delivery_status === 'filled' || p.delivery_status === 'sent' || p.delivery_status === 'received');
    if (filled.length === 0) { flash('Belum ada alamat yg terisi', true); return; }

    const rows = [
      ['No', 'Nama Peserta', 'Nama Penerima', 'No HP', 'Alamat', 'Kelurahan', 'Kecamatan', 'Kota', 'Provinsi', 'Kode Pos', 'Catatan', 'Status', 'Kurir', 'Resi'],
      ...filled.map((p, i) => {
        const c = p.customers || {};
        return [
          i + 1,
          c.name || '',
          p.delivery_recipient || '',
          p.delivery_phone || '',
          p.delivery_street || '',
          p.delivery_kelurahan || '',
          p.delivery_kecamatan || '',
          p.delivery_kota || '',
          p.delivery_provinsi || '',
          p.delivery_kode_pos || '',
          p.delivery_notes || '',
          p.delivery_status || '',
          p.delivery_courier || '',
          p.delivery_resi || '',
        ];
      }),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daftar-alamat-pengiriman-trip-${tripId}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    flash(`✓ Downloaded daftar alamat ${filled.length} peserta`);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-pink-50 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-purple-700">📦 Pengiriman Perlengkapan</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            {counts.pending} belum isi · {counts.filled} siap kirim · {counts.sent} dikirim · {counts.received} diterima
            {counts.skip > 0 && ` · ${counts.skip} skip`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {counts.pending > 0 && (
            <button
              onClick={handleBulkSend}
              disabled={pending}
              className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold rounded disabled:opacity-50"
            >
              📨 Kirim Link ke {counts.pending} Peserta
            </button>
          )}
          <button
            onClick={downloadExcel}
            disabled={pending}
            className="px-3 py-1.5 bg-green-100 hover:bg-green-200 text-green-800 text-xs font-semibold rounded"
          >
            📥 Download Daftar (CSV)
          </button>
        </div>
      </div>

      {msg && (
        <div className={`px-5 py-2 text-xs ${msg.isErr ? 'bg-red-50 text-red-700 border-b border-red-200' : 'bg-green-50 text-green-700 border-b border-green-200'}`}>
          {msg.text}
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {passengers.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">Belum ada peserta</p>
        ) : (
          passengers.map((p) => {
            const c = p.customers || {};
            const status = STATUS_BADGE[p.delivery_status || 'pending'];
            const isFilled = ['filled', 'sent', 'received'].includes(p.delivery_status);
            const isSent = p.delivery_status === 'sent' || p.delivery_status === 'received';

            return (
              <div key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-800">{c.name || '—'}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${status.cls}`}>{status.label}</span>
                      {p.delivery_link_sent_at && p.delivery_status === 'pending' && (
                        <span className="text-[10px] text-slate-500">
                          Link dikirim: {fmtDate(p.delivery_link_sent_at)}
                        </span>
                      )}
                    </div>

                    {isFilled && (
                      <div className="mt-2 text-xs text-slate-700 bg-slate-50 rounded p-2">
                        <p className="font-semibold">📍 {p.delivery_recipient}</p>
                        <p className="text-slate-600">📞 {p.delivery_phone}</p>
                        <p className="text-slate-600 mt-1">
                          {p.delivery_street}<br />
                          {p.delivery_kelurahan}, {p.delivery_kecamatan}<br />
                          {p.delivery_kota}, {p.delivery_provinsi} {p.delivery_kode_pos}
                        </p>
                        {p.delivery_notes && (
                          <p className="text-slate-500 italic mt-1">📝 {p.delivery_notes}</p>
                        )}
                      </div>
                    )}

                    {isSent && (
                      <div className="mt-2 text-xs text-blue-800 bg-blue-50 rounded p-2 border border-blue-200">
                        🚚 <b>{p.delivery_courier}</b> · Resi: <b className="font-mono">{p.delivery_resi}</b>
                        <br />
                        <span className="text-slate-500">Dikirim: {fmtDate(p.delivery_sent_at)}{p.delivery_sent_by && ` oleh ${p.delivery_sent_by}`}</span>
                        {p.delivery_received_at && (
                          <span className="block text-green-700">✓ Diterima: {fmtDate(p.delivery_received_at)}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 items-end">
                    {p.delivery_status === 'pending' && (
                      <>
                        <button onClick={() => handleSendLink(p.id)} disabled={pending}
                          className="text-xs px-3 py-1 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded">
                          📨 Kirim Link WA
                        </button>
                        <button onClick={() => copyLink(p.delivery_token)}
                          className="text-[10px] text-slate-500 hover:underline">
                          🔗 Copy link
                        </button>
                        <button onClick={() => handleSkip(p.id)} disabled={pending}
                          className="text-[10px] text-slate-400 hover:underline">
                          Skip pengiriman
                        </button>
                      </>
                    )}

                    {p.delivery_status === 'filled' && (
                      <>
                        <button onClick={() => setOpenSent(openSent === p.id ? null : p.id)} disabled={pending}
                          className="text-xs px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded">
                          🚚 Mark Dikirim
                        </button>
                        <button onClick={() => handleSendLink(p.id)} disabled={pending}
                          className="text-[10px] text-slate-500 hover:underline">
                          📨 Kirim link lagi (revisi)
                        </button>
                      </>
                    )}

                    {p.delivery_status === 'sent' && (
                      <>
                        <button onClick={() => handleReceived(p.id)} disabled={pending}
                          className="text-xs px-3 py-1 bg-green-500 hover:bg-green-600 text-white font-semibold rounded">
                          ✓ Mark Diterima
                        </button>
                        <button onClick={() => handleReset(p.id)} disabled={pending}
                          className="text-[10px] text-red-500 hover:underline">
                          ↶ Reset sent
                        </button>
                      </>
                    )}

                    {p.delivery_status === 'received' && (
                      <button onClick={() => handleReset(p.id)} disabled={pending}
                        className="text-[10px] text-slate-500 hover:underline">
                        ↶ Reset
                      </button>
                    )}
                  </div>
                </div>

                {/* Mark Sent form (inline) */}
                {openSent === p.id && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded space-y-2">
                    <p className="text-xs font-bold text-blue-800">🚚 Input Info Pengiriman</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[11px] text-slate-700 block mb-0.5">Kurir</span>
                        <select value={courier} onChange={(e) => setCourier(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white">
                          <option value="JNE">JNE</option>
                          <option value="J&T">J&T</option>
                          <option value="SiCepat">SiCepat</option>
                          <option value="Anteraja">Anteraja</option>
                          <option value="Pos Indonesia">Pos Indonesia</option>
                          <option value="Ninja Express">Ninja Express</option>
                          <option value="GoSend">GoSend</option>
                          <option value="GrabExpress">GrabExpress</option>
                          <option value="Lainnya">Lainnya</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[11px] text-slate-700 block mb-0.5">No. Resi</span>
                        <input type="text" value={resi} onChange={(e) => setResi(e.target.value)}
                          placeholder="Contoh: JNE1234567890"
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white" />
                      </label>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setOpenSent(null)}
                        className="px-3 py-1 text-xs bg-slate-200 hover:bg-slate-300 rounded">
                        Batal
                      </button>
                      <button onClick={() => handleSent(p.id)} disabled={pending || !courier || !resi}
                        className="px-3 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white font-bold rounded disabled:opacity-50">
                        ✓ Confirm Dikirim + Kirim WA
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
