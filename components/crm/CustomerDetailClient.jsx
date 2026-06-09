'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { updateCustomerCRM } from '@/lib/actions/crm';

function fmtRupiah(n) { return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); }
function fmtDate(s) { if (!s) return '—'; try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; } }

const STATUS_BADGE = {
  lead: { label: 'Lead', cls: 'bg-slate-100 text-slate-600' },
  new: { label: 'Baru', cls: 'bg-blue-100 text-blue-700' },
  repeat: { label: 'Repeat', cls: 'bg-green-100 text-green-700' },
  vip: { label: 'VIP', cls: 'bg-yellow-100 text-yellow-800' },
};

export default function CustomerDetailClient({ customer, history = [], referrals = [], referrer }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState(null);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({
    name: customer.name || '', phone: customer.phone || '', whatsapp: customer.whatsapp || '',
    email: customer.email || '', city: customer.city || '', address: customer.address || '',
    referral_source: customer.referral_source || '', birthday: customer.birthday || '',
    notes: customer.notes || '', tags: (customer.tags || []).join(', '),
  });
  const [blacklist, setBlacklist] = useState(!!customer.is_blacklisted);
  const [blacklistReason, setBlacklistReason] = useState(customer.blacklist_reason || '');

  const b = STATUS_BADGE[customer.status] || STATUS_BADGE.lead;

  function save() {
    startTransition(async () => {
      const r = await updateCustomerCRM(customer.id, {
        ...f, tags: f.tags.split(',').map((x) => x.trim()).filter(Boolean),
        is_blacklisted: blacklist, blacklist_reason: blacklist ? blacklistReason : null,
      });
      if (r?.error) { setMsg({ t: r.error, e: true }); return; }
      setMsg({ t: 'Tersimpan' }); setEdit(false); router.refresh();
      setTimeout(() => setMsg(null), 3000);
    });
  }

  const input = 'w-full px-3 py-1.5 border border-slate-300 rounded text-sm';

  return (
    <div className="mt-3 space-y-4">
      {msg && <div className={`px-4 py-2 rounded text-sm ${msg.e ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg.t}</div>}

      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800">{customer.name}</h1>
            <span className={`text-[11px] px-2 py-0.5 rounded font-bold ${b.cls}`}>{b.label}</span>
            {customer.is_blacklisted && <span className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded font-bold">BLACKLIST</span>}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {customer.phone || customer.whatsapp || '—'}{customer.email ? ` · ${customer.email}` : ''}{customer.city ? ` · ${customer.city}` : ''}
          </p>
          {referrer && <p className="text-xs text-slate-500 mt-1">Direferensikan oleh: <Link href={`/crm/${referrer.id}`} className="text-brand-600 hover:underline">{referrer.name}</Link></p>}
        </div>
        <button onClick={() => setEdit((v) => !v)} className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded">
          {edit ? 'Batal' : '✏️ Edit'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-3 text-center">
          <p className="text-[10px] text-slate-500 uppercase font-bold">Total Trip</p>
          <p className="text-2xl font-bold text-brand-700">{customer.total_trips || 0}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3 text-center">
          <p className="text-[10px] text-slate-500 uppercase font-bold">Total Belanja</p>
          <p className="text-lg font-bold text-green-700">{fmtRupiah(customer.total_spent)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3 text-center">
          <p className="text-[10px] text-slate-500 uppercase font-bold">Trip Pertama</p>
          <p className="text-sm font-semibold text-slate-700">{fmtDate(customer.first_trip_at)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3 text-center">
          <p className="text-[10px] text-slate-500 uppercase font-bold">Trip Terakhir</p>
          <p className="text-sm font-semibold text-slate-700">{fmtDate(customer.last_trip_at)}</p>
        </div>
      </div>

      {/* Edit panel */}
      {edit && (
        <div className="bg-white border border-brand-200 rounded-xl p-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="text-[11px] font-bold text-slate-600">Nama</label><input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div><label className="text-[11px] font-bold text-slate-600">No. HP</label><input className={input} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
            <div><label className="text-[11px] font-bold text-slate-600">WhatsApp</label><input className={input} value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></div>
            <div><label className="text-[11px] font-bold text-slate-600">Email</label><input className={input} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div><label className="text-[11px] font-bold text-slate-600">Kota</label><input className={input} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></div>
            <div><label className="text-[11px] font-bold text-slate-600">Sumber</label><input className={input} value={f.referral_source} onChange={(e) => setF({ ...f, referral_source: e.target.value })} placeholder="Instagram / Referral / dll" /></div>
            <div><label className="text-[11px] font-bold text-slate-600">Ulang Tahun</label><input type="date" className={input} value={f.birthday || ''} onChange={(e) => setF({ ...f, birthday: e.target.value })} /></div>
            <div><label className="text-[11px] font-bold text-slate-600">Tags (pisah koma)</label><input className={input} value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="vip, alumni, hati-hati" /></div>
          </div>
          <div><label className="text-[11px] font-bold text-slate-600">Catatan</label><textarea rows={3} className={input + ' resize-none'} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          <div className="p-3 bg-red-50 border border-red-200 rounded">
            <label className="flex items-center gap-2 text-sm font-semibold text-red-700">
              <input type="checkbox" checked={blacklist} onChange={(e) => setBlacklist(e.target.checked)} /> Blacklist customer ini
            </label>
            {blacklist && <input className={input + ' mt-2'} value={blacklistReason} onChange={(e) => setBlacklistReason(e.target.value)} placeholder="Alasan blacklist" />}
          </div>
          <button onClick={save} disabled={pending} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded">
            {pending ? 'Menyimpan…' : '💾 Simpan'}
          </button>
        </div>
      )}

      {/* Notes (read) */}
      {!edit && customer.notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-slate-700">
          <p className="text-[11px] font-bold text-amber-800 uppercase mb-1">Catatan</p>
          {customer.notes}
        </div>
      )}

      {/* Trip history */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50"><h2 className="font-bold text-brand-700">🧳 Riwayat Trip ({history.length})</h2></div>
        {history.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">Belum ada riwayat trip.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {history.map((h) => (
              <div key={h.id} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-semibold text-slate-800">
                    {h.trip ? <Link href={`/trips/${h.trip.id}`} className="hover:underline text-brand-700">{h.trip.kode_trip || ''} {h.trip.name}</Link> : `Trip ${h.trip_id}`}
                  </p>
                  <p className="text-xs text-slate-500">{fmtDate(h.trip?.departure || h.joined_at)} · {h.room_type || '—'}
                    {h.refund_status === 'refunded' && <span className="ml-1 text-red-600 font-semibold">· REFUND</span>}
                    {h.transfer_status === 'transferred' && <span className="ml-1 text-amber-600 font-semibold">· PINDAH</span>}
                  </p>
                </div>
                <p className="font-semibold text-slate-700">{fmtRupiah(h.price_paid)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Referrals */}
      {referrals.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50"><h2 className="font-bold text-brand-700">🔗 Referral ({referrals.length})</h2></div>
          <div className="divide-y divide-slate-100">
            {referrals.map((r) => (
              <Link key={r.id} href={`/crm/${r.id}`} className="px-5 py-2.5 flex items-center justify-between hover:bg-slate-50">
                <span className="text-sm text-brand-700">{r.name}</span>
                <span className="text-xs text-slate-500">{r.total_trips || 0} trip</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
