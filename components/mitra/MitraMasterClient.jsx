'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveMitra, saveFeeTemplate, payoutMitraFee } from '@/lib/actions/mitra';

function fmtRupiah(n) { return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); }
const periodNow = () => new Date().toISOString().slice(0, 7);

export default function MitraMasterClient({ stats = [], template = [] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState('mitra');
  const [msg, setMsg] = useState(null);
  const [tpl, setTpl] = useState(template.map((t) => ({ category: t.category, fee: t.fee })));
  const [form, setForm] = useState({ id: '', name: '', phone: '', email: '', notes: '' });

  const totalRemaining = stats.reduce((s, m) => s + (m.remaining || 0), 0);

  function flash(t, e) { setMsg({ t, e }); setTimeout(() => setMsg(null), 3500); }

  function submitMitra() {
    startTransition(async () => {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.set(k, v));
      const r = await saveMitra(fd);
      if (r?.error) return flash(r.error, true);
      flash('Mitra tersimpan'); setForm({ id: '', name: '', phone: '', email: '', notes: '' }); router.refresh();
    });
  }
  function saveTpl() {
    startTransition(async () => {
      const r = await saveFeeTemplate(tpl);
      if (r?.error) return flash(r.error, true);
      flash('Template fee tersimpan'); router.refresh();
    });
  }
  function payout(m) {
    const amt = prompt(`Cairkan fee ${m.name}. Sisa: ${fmtRupiah(m.remaining)}\nMasukkan jumlah:`, String(m.remaining));
    if (!amt) return;
    startTransition(async () => {
      const r = await payoutMitraFee(m.id, Number(String(amt).replace(/\D/g, '')), periodNow());
      if (r?.error) return flash(r.error, true);
      flash('Fee dicairkan & tercatat di accounting'); router.refresh();
    });
  }

  const input = 'px-2 py-1.5 border border-slate-300 rounded text-sm';

  return (
    <div className="space-y-4">
      {msg && <div className={`px-4 py-2 rounded text-sm ${msg.e ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg.t}</div>}

      {totalRemaining > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-sm">
          🔔 <strong>Fee mitra belum dicairkan: {fmtRupiah(totalRemaining)}</strong> — segera proses pencairan (awal bulan).
        </div>
      )}

      <div className="flex gap-2">
        {[['mitra', '🤝 Mitra & Penjualan'], ['fee', '💰 Template Fee']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded text-sm font-semibold ${tab === k ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600'}`}>{l}</button>
        ))}
      </div>

      {tab === 'fee' ? (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="font-bold text-slate-700 mb-3">Fee per kategori trip (Rp / pax closing)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {tpl.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-28 text-sm font-semibold text-slate-700">{t.category}</span>
                <input type="text" inputMode="numeric" value={Number(t.fee).toLocaleString('id-ID')}
                  onChange={(e) => { const n = e.target.value.replace(/\D/g, ''); const next = [...tpl]; next[i] = { ...t, fee: Number(n) || 0 }; setTpl(next); }}
                  className={input + ' flex-1 font-mono'} />
              </div>
            ))}
          </div>
          <button onClick={saveTpl} disabled={pending} className="mt-3 px-4 py-2 bg-green-600 text-white text-sm font-bold rounded">💾 Simpan Template</button>
        </div>
      ) : (
        <>
          {/* Form tambah mitra */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="font-bold text-slate-700 mb-2">{form.id ? 'Edit Mitra' : '+ Tambah Mitra'}</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama mitra" className={input} />
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="No HP (untuk login)" className={input} />
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email (opsional)" className={input} />
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Catatan" className={input} />
            </div>
            <button onClick={submitMitra} disabled={pending} className="mt-2 px-4 py-2 bg-brand-500 text-white text-sm font-bold rounded">{form.id ? 'Simpan' : 'Tambah'}</button>
            {form.id && <button onClick={() => setForm({ id: '', name: '', phone: '', email: '', notes: '' })} className="ml-2 text-sm text-slate-500">batal</button>}
          </div>

          {/* List mitra + stats */}
          <div className="space-y-3">
            {stats.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">Belum ada mitra.</p> : stats.map((m) => (
              <div key={m.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <p className="font-bold text-slate-800">{m.name} {!m.active && <span className="text-[10px] px-1 bg-slate-200 rounded">nonaktif</span>}</p>
                    <p className="text-xs text-slate-500">{m.phone || '—'}{m.email ? ` · ${m.email}` : ''}{m.user_id ? ' · ✅ akun aktif' : ' · belum login'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setForm({ id: m.id, name: m.name, phone: m.phone || '', email: m.email || '', notes: m.notes || '' })} className="text-xs px-2 py-1 bg-slate-100 rounded">Edit</button>
                    {m.remaining > 0 && <button onClick={() => payout(m)} disabled={pending} className="text-xs px-2 py-1 bg-green-600 text-white rounded font-bold">Cairkan Fee</button>}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                  <div className="bg-slate-50 rounded p-2"><p className="text-[10px] text-slate-500 uppercase font-bold">Terjual</p><p className="text-lg font-bold text-brand-700">{m.sold}</p></div>
                  <div className="bg-slate-50 rounded p-2"><p className="text-[10px] text-slate-500 uppercase font-bold">Fee Total</p><p className="text-sm font-bold text-slate-800">{fmtRupiah(m.feeEarned)}</p></div>
                  <div className="bg-green-50 rounded p-2"><p className="text-[10px] text-green-600 uppercase font-bold">Dicairkan</p><p className="text-sm font-bold text-green-700">{fmtRupiah(m.paid)}</p></div>
                  <div className="bg-amber-50 rounded p-2"><p className="text-[10px] text-amber-600 uppercase font-bold">Sisa</p><p className="text-sm font-bold text-amber-700">{fmtRupiah(m.remaining)}</p></div>
                </div>
                {m.trips.length > 0 && (
                  <div className="mt-2 text-xs text-slate-600">
                    <span className="font-semibold">Trip:</span> {m.trips.map((t) => `${t.name} (${t.count} pax · ${t.cat})`).join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
