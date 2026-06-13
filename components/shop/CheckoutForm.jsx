'use client';
import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createBooking } from '@/lib/actions/shop-checkout';
import { createClient } from '@/lib/supabase/client';

function fmtRp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }

export default function CheckoutForm({ trip }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState('');

  const items = trip.priceItems || { rooms: [], specials: [] };
  const adminFee = Number(trip.adminFee || 0);
  const allItems = [...(items.rooms || []), ...(items.specials || [])];

  // qty per key
  const [qty, setQty] = useState(() => {
    const init = {};
    allItems.forEach((it) => { init[it.key] = 0; });
    if (items.rooms?.[0]) init[items.rooms[0].key] = 1; // default 1 di kamar pertama
    return init;
  });
  const [payType, setPayType] = useState('dp');

  // akun
  const [loggedIn, setLoggedIn] = useState(false);
  const [makeAcc, setMakeAcc] = useState(true);
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await createClient().auth.getUser();
        if (data?.user) { setLoggedIn(true); setMakeAcc(false); }
      } catch { /* ignore */ }
    })();
  }, []);

  function setItemQty(key, delta) {
    setQty((q) => {
      const next = Math.max(0, (q[key] || 0) + delta);
      const others = Object.entries(q).reduce((s, [k, v]) => s + (k === key ? 0 : v), 0);
      if (others + next > trip.seat) return q; // jangan lewati sisa seat
      return { ...q, [key]: next };
    });
  }

  const pax = Object.values(qty).reduce((s, v) => s + v, 0);
  const subtotalFull = allItems.reduce((s, it) => s + it.price * (qty[it.key] || 0), 0);
  const dp = Number(trip.dp_amount || 0);
  const dpBase = dp > 0 ? dp * pax : Math.round(subtotalFull * 0.2);
  const base = payType === 'full' ? subtotalFull : dpBase;
  const amount = pax > 0 ? base + adminFee : 0;

  function submit(e) {
    e.preventDefault();
    setErr('');
    if (pax < 1) { setErr('Pilih minimal 1 peserta (kamar atau kategori).'); return; }
    const fd = new FormData(e.target);
    const email = (fd.get('lead_email') || '').toString().trim();
    if (makeAcc && !loggedIn) {
      if (!email) { setErr('Email wajib diisi untuk membuat akun peserta.'); return; }
      if (pwd.length < 6) { setErr('Password minimal 6 karakter.'); return; }
      if (pwd !== pwd2) { setErr('Konfirmasi password tidak sama.'); return; }
      fd.set('password', pwd);
    }
    const composition = allItems
      .filter((it) => (qty[it.key] || 0) > 0)
      .map((it) => ({ key: it.key, label: it.label, qty: qty[it.key] }));
    fd.set('trip_id', trip.id);
    fd.set('composition', JSON.stringify(composition));
    fd.set('payment_type', payType);
    startTransition(async () => {
      const r = await createBooking(fd);
      if (r?.error) { setErr(r.error); return; }
      if (makeAcc && !loggedIn && (r.account === 'created' || r.account === 'exists') && r.email) {
        try {
          const { error: sErr } = await createClient().auth.signInWithPassword({ email: r.email, password: pwd });
          if (!sErr) { router.push('/akun'); return; }
        } catch { /* fallback */ }
      }
      router.push(`/order/${r.id}`);
    });
  }

  const inp = 'w-full mt-1 px-3 py-2.5 border border-slate-300 rounded-xl text-sm';
  const Stepper = ({ it }) => (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
      <div>
        <p className="text-sm font-semibold text-slate-800">{it.label}</p>
        <p className="text-xs text-slate-500">{fmtRp(it.price)} / orang</p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setItemQty(it.key, -1)} className="w-8 h-8 rounded-lg border border-slate-300 font-bold disabled:opacity-40" disabled={(qty[it.key] || 0) <= 0}>−</button>
        <span className="w-6 text-center font-bold">{qty[it.key] || 0}</span>
        <button type="button" onClick={() => setItemQty(it.key, +1)} className="w-8 h-8 rounded-lg border border-slate-300 font-bold disabled:opacity-40" disabled={pax >= trip.seat}>+</button>
      </div>
    </div>
  );

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block"><span className="text-xs font-bold text-slate-600">Nama Pemesan *</span>
          <input name="lead_name" required placeholder="Nama lengkap" className={inp} /></label>
        <label className="block"><span className="text-xs font-bold text-slate-600">No HP / WhatsApp *</span>
          <input name="lead_phone" required placeholder="0812..." className={inp} /></label>
        <label className="block sm:col-span-2"><span className="text-xs font-bold text-slate-600">Email {makeAcc && !loggedIn ? '*' : ''}</span>
          <input name="lead_email" type="email" placeholder="email@kamu.com" className={inp} /></label>
      </div>

      {/* KAMAR */}
      {items.rooms?.length > 0 && (
        <div className="border border-slate-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-slate-800">🛏 Kamar (pilih jumlah orang)</p>
          <p className="text-[11px] text-slate-400 mb-1">Double = 2 orang, Triple = 3 orang, dst. Harga per orang.</p>
          {items.rooms.map((it) => <Stepper key={it.key} it={it} />)}
        </div>
      )}

      {/* KATEGORI KHUSUS */}
      {items.specials?.length > 0 && (
        <div className="border border-slate-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-slate-800">👶 Kategori Khusus</p>
          <p className="text-[11px] text-slate-400 mb-1">Child no bed, infant, atau land tour only — bisa digabung dgn kamar.</p>
          {items.specials.map((it) => <Stepper key={it.key} it={it} />)}
        </div>
      )}

      {/* Pembayaran */}
      <div>
        <span className="text-xs font-bold text-slate-600">Pilih Pembayaran</span>
        <div className="grid grid-cols-2 gap-3 mt-1">
          <button type="button" onClick={() => setPayType('dp')} className={`p-3 rounded-xl border-2 text-left ${payType === 'dp' ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`} disabled={dp <= 0}>
            <p className="font-bold text-slate-800">Bayar DP</p>
            <p className="text-xs text-slate-500">{dp > 0 ? fmtRp(dp) + ' /orang' : 'tidak tersedia'}</p>
          </button>
          <button type="button" onClick={() => setPayType('full')} className={`p-3 rounded-xl border-2 text-left ${payType === 'full' ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
            <p className="font-bold text-slate-800">Bayar Lunas</p>
            <p className="text-xs text-slate-500">total paket</p>
          </button>
        </div>
      </div>

      {/* Ringkasan */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-1.5">
        <div className="flex justify-between text-sm"><span className="opacity-80">Total peserta</span><span className="font-bold">{pax} orang</span></div>
        <div className="flex justify-between text-sm"><span className="opacity-80">Harga paket</span><span className="font-bold">{fmtRp(subtotalFull)}</span></div>
        {payType === 'dp' && <div className="flex justify-between text-sm"><span className="opacity-80">DP ({fmtRp(dp)} × {pax})</span><span className="font-bold">{fmtRp(dpBase)}</span></div>}
        <div className="flex justify-between text-sm"><span className="opacity-80">Biaya admin</span><span className="font-bold">{fmtRp(adminFee)}</span></div>
        <div className="flex justify-between pt-2 mt-1 border-t border-white/20">
          <span className="font-bold">Bayar sekarang ({payType === 'full' ? 'Lunas' : 'DP'})</span>
          <span className="text-2xl font-extrabold">{fmtRp(amount)}</span>
        </div>
        {payType === 'dp' && pax > 0 && <p className="text-[11px] opacity-70">Sisa pelunasan: {fmtRp(Math.max(subtotalFull - dpBase, 0))} (dibayar bertahap nanti)</p>}
      </div>

      {/* Buat akun (sembunyi kalau sudah login) */}
      {!loggedIn ? (
        <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={makeAcc} onChange={(e) => setMakeAcc(e.target.checked)} className="w-4 h-4" />
            <span className="text-sm font-bold text-slate-800">Buat akun peserta (pantau status pembayaran & trip)</span>
          </label>
          {makeAcc && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <label className="block"><span className="text-xs font-bold text-slate-600">Password *</span>
                <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="min. 6 karakter" className={inp} autoComplete="new-password" /></label>
              <label className="block"><span className="text-xs font-bold text-slate-600">Ulangi Password *</span>
                <input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} placeholder="ketik ulang" className={inp} autoComplete="new-password" /></label>
              <p className="sm:col-span-2 text-[11px] text-slate-500">Sudah punya akun? <a href="/masuk" className="font-bold text-emerald-600 underline">Masuk dulu</a> biar tinggal pesan.</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-emerald-700 bg-emerald-50 rounded-xl p-2.5">✓ Kamu sudah login — pesanan otomatis masuk ke akunmu.</p>
      )}

      {err && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">⚠ {err}</div>}

      <button type="submit" disabled={pending || pax < 1} className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-lg">
        {pending ? 'Memproses...' : 'Lanjut ke Pembayaran →'}
      </button>
      <p className="text-[11px] text-center text-slate-400">Dengan memesan, kamu setuju dengan syarat & ketentuan trip.</p>
    </form>
  );
}
