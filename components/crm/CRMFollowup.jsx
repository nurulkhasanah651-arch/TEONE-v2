'use client';

import { useState, useTransition, useEffect } from 'react';
import { getFollowupLists, getBroadcastRecipients, sendCrmBroadcast, sendCustomerWA } from '@/lib/actions/crm';

function fmtDate(s) { if (!s) return '—'; try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; } }
function waLink(phone, text) {
  const p = String(phone || '').replace(/\D/g, '').replace(/^0/, '62');
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}

export default function CRMFollowup({ brandName = 'kami', sources = [], openTrips = [] }) {
  const [tab, setTab] = useState('offer');
  const [pending, startTransition] = useTransition();
  const [lists, setLists] = useState({ birthdays: [], passportExpiring: [] });
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    getFollowupLists().then((r) => { if (r?.ok) setLists(r); });
  }, []);

  // ---- Broadcast tawarkan trip ----
  const [segment, setSegment] = useState('all');
  const [source, setSource] = useState('');
  const [tripId, setTripId] = useState('');
  const [discount, setDiscount] = useState('');
  const [bcMsg, setBcMsg] = useState('');
  const [recipients, setRecipients] = useState(null);

  const trip = openTrips.find((t) => t.id === tripId);

  function buildOfferMsg() {
    let m = `Halo {nama},\n\n`;
    if (trip) {
      m += `Ada trip baru nih: *${trip.kode_trip || ''} ${trip.name}*\n`;
      if (trip.departure) m += `📅 Keberangkatan: ${fmtDate(trip.departure)}\n`;
      if (trip.harga_jual || trip.price) m += `💰 Mulai: Rp ${Number(trip.harga_jual || trip.price).toLocaleString('id-ID')}\n`;
    } else {
      m += `Ada penawaran trip terbaru dari ${brandName}!\n`;
    }
    if (discount.trim()) m += `\n🎁 *DISKON KHUSUS:* ${discount.trim()}\n`;
    m += `\nMinat? Balas pesan ini ya, slot terbatas 🙏\n\n_${brandName}_`;
    return m;
  }

  function loadOffer() {
    setBcMsg(buildOfferMsg());
    startTransition(async () => {
      const r = await getBroadcastRecipients({ segment, source });
      if (r?.ok) setRecipients(r.recipients);
      else setMsg({ t: r.error, e: true });
    });
  }

  function sendBroadcast() {
    if (!recipients || recipients.length === 0) { setMsg({ t: 'Belum ada penerima — klik "Siapkan" dulu', e: true }); return; }
    if (!confirm(`Kirim broadcast ke ${recipients.length} customer via WhatsApp (Fonnte)?`)) return;
    startTransition(async () => {
      const r = await sendCrmBroadcast(recipients, bcMsg);
      if (r?.error) { setMsg({ t: r.error, e: true }); return; }
      setMsg({ t: `Terkirim ${r.sent}/${r.total} (gagal ${r.failed})` });
    });
  }

  function sendFonnteOne(phone, text) {
    if (!phone) { setMsg({ t: 'Nomor HP kosong', e: true }); return; }
    startTransition(async () => {
      const r = await sendCustomerWA(phone, text);
      if (r?.error) setMsg({ t: 'Gagal kirim Fonnte: ' + r.error, e: true });
      else setMsg({ t: 'Terkirim via Fonnte ✓' });
    });
  }

  const input = 'w-full px-3 py-1.5 border border-slate-300 rounded text-sm';

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2 flex-wrap">
        <h2 className="font-bold text-brand-700 flex-1">📣 Follow-up & Marketing</h2>
        {[['offer', '🎯 Tawarkan Trip'], ['bday', `🎂 Ultah (${lists.birthdays.length})`], ['passport', `🛂 Paspor Expired (${lists.passportExpiring.length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-1 rounded text-xs font-semibold ${tab === k ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600'}`}>{l}</button>
        ))}
      </div>

      {msg && <div className={`px-5 py-2 text-sm ${msg.e ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg.t}</div>}

      <div className="p-5">
        {tab === 'offer' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600">Segmen Customer</label>
                <select value={segment} onChange={(e) => setSegment(e.target.value)} className={input}>
                  <option value="all">Semua customer</option>
                  <option value="lead">Lead (belum pernah trip)</option>
                  <option value="new">Baru (1 trip)</option>
                  <option value="repeat">Repeat (2-4 trip)</option>
                  <option value="vip">VIP (5+ trip)</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600">Sumber (opsional)</label>
                <select value={source} onChange={(e) => setSource(e.target.value)} className={input}>
                  <option value="">Semua sumber</option>
                  {sources.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600">Trip yang ditawarkan (opsional)</label>
                <select value={tripId} onChange={(e) => setTripId(e.target.value)} className={input}>
                  <option value="">— Tanpa trip spesifik —</option>
                  {openTrips.map((t) => <option key={t.id} value={t.id}>{t.kode_trip || ''} {t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600">🎁 Diskon Khusus (opsional)</label>
                <input value={discount} onChange={(e) => setDiscount(e.target.value)} className={input} placeholder="Contoh: Potongan Rp 1jt utk 10 pendaftar pertama" />
              </div>
            </div>
            <button onClick={loadOffer} disabled={pending} className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded">
              🔄 Siapkan pesan & penerima
            </button>
            {bcMsg && (
              <div>
                <label className="text-[11px] font-bold text-slate-600">Pesan ( {'{nama}'} otomatis diganti nama customer )</label>
                <textarea rows={9} value={bcMsg} onChange={(e) => setBcMsg(e.target.value)} className={input + ' font-mono text-xs'} />
              </div>
            )}
            {recipients && (
              <div className="flex items-center justify-between gap-3 flex-wrap p-3 bg-brand-50 border border-brand-200 rounded">
                <p className="text-sm text-brand-800">📨 <strong>{recipients.length}</strong> customer akan menerima broadcast</p>
                <button onClick={sendBroadcast} disabled={pending || recipients.length === 0} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded disabled:opacity-50">
                  {pending ? 'Mengirim…' : '🚀 Kirim Broadcast'}
                </button>
              </div>
            )}
            <p className="text-[11px] text-slate-500">Broadcast dikirim via WhatsApp (Fonnte). Pastikan nomor Fonnte sudah tersambung. Blacklist otomatis dikecualikan.</p>
          </div>
        )}

        {tab === 'bday' && (
          <div className="space-y-2">
            {lists.birthdays.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">Tidak ada yang ulang tahun bulan ini.</p> : lists.birthdays.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 p-2 border border-slate-100 rounded">
                <div><p className="text-sm font-semibold text-slate-800">{c.name}</p><p className="text-xs text-slate-500">🎂 {fmtDate(c.birthday)} · {c.phone || '—'}</p></div>
                {c.phone && (() => { const t = `Halo ${c.name}, selamat ulang tahun! 🎉 Semoga sehat selalu & dimudahkan rezekinya. Salam hangat, ${brandName} 🙏`; return (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => sendFonnteOne(c.phone, t)} disabled={pending} className="px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded">📲 Fonnte</button>
                    <a href={waLink(c.phone, t)} target="_blank" rel="noreferrer" className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded">💬 Manual</a>
                  </div>
                ); })()}
              </div>
            ))}
          </div>
        )}

        {tab === 'passport' && (
          <div className="space-y-2">
            {lists.passportExpiring.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">Tidak ada paspor yang akan expired dalam 6 bulan.</p> : lists.passportExpiring.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 p-2 border border-slate-100 rounded">
                <div><p className="text-sm font-semibold text-slate-800">{c.name}</p><p className="text-xs text-slate-500">🛂 {c.passport_no || '—'} · Exp: <span className="text-red-600 font-semibold">{fmtDate(c.passport_expiry)}</span></p></div>
                {c.phone && (() => { const t = `Halo ${c.name}, kami ingatkan paspor Anda (${c.passport_no || ''}) akan kedaluwarsa pada ${fmtDate(c.passport_expiry)}. Mohon segera perpanjang agar tidak mengganggu rencana perjalanan. Terima kasih 🙏 — ${brandName}`; return (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => sendFonnteOne(c.phone, t)} disabled={pending} className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded">📲 Fonnte</button>
                    <a href={waLink(c.phone, t)} target="_blank" rel="noreferrer" className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded">💬 Manual</a>
                  </div>
                ); })()}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
