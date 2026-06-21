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
  const [info, setInfo] = useState('');
  const [needLogin, setNeedLogin] = useState(false);

  const items = trip.priceItems || { rooms: [], specials: [] };
  const adminFee = Number(trip.adminFee || 0);
  const allItems = [...(items.rooms || []), ...(items.specials || [])];

  const [qty, setQty] = useState(() => {
    const init = {};
    allItems.forEach((it) => { init[it.key] = 0; });
    if (items.rooms?.[0]) init[items.rooms[0].key] = 1;
    return init;
  });
  const [names, setNames] = useState(['']);
  const [dobs, setDobs] = useState([]);
  const RETURN = trip.return_date || null;
  const needsDob = (key) => key === 'infant' || key === 'child_no_bed';
  function monthsAt(dob, ref) {
    if (!dob || !ref) return null;
    const b = new Date(dob + 'T00:00:00'), r = new Date(ref + 'T00:00:00');
    if (isNaN(b) || isNaN(r)) return null;
    let m = (r.getFullYear() - b.getFullYear()) * 12 + (r.getMonth() - b.getMonth());
    if (r.getDate() < b.getDate()) m -= 1;
    return m;
  }
  // null = ok; string = pesan error
  function ageText(dob) {
    const m = monthsAt(dob, RETURN);
    if (m == null || m < 0) return '';
    const y = Math.floor(m / 12), mo = m % 12;
    return (y ? `${y} th ` : '') + `${mo} bln`;
  }
  function dobError(key, dob) {
    if (!needsDob(key)) return null;
    if (!dob) return 'Wajib isi tanggal lahir.';
    if (!RETURN) return null; // tgl pulang trip belum diisi → tidak bisa cek umur, terima saja
    const m = monthsAt(dob, RETURN);
    if (m == null) return 'Tanggal lahir belum benar.';
    if (m < 0) return 'Tanggal lahir kok setelah tanggal pulang? Cek lagi ya.';
    if (key === 'infant' && m > 24) return `Umur saat pulang ${ageText(dob)} — infant maksimal 24 bulan. Pilih kategori lain (Child/kamar).`;
    if (key === 'child_no_bed' && Math.floor(m / 12) > 12) return `Umur saat pulang ${ageText(dob)} — child no bed maksimal 12 tahun. Pilih kamar biasa.`;
    return null;
  }
  const [payType, setPayType] = useState('dp');

  const [loggedIn, setLoggedIn] = useState(false);
  const [profile, setProfile] = useState({ name: '', phone: '', email: '' });
  const [makeAcc, setMakeAcc] = useState(true);
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');

  useEffect(() => {
    (async () => {
      try { const { data } = await createClient().auth.getUser(); if (data?.user) { setLoggedIn(true); setMakeAcc(false); } } catch {}
    })();
  }, []);

  // slot per orang (urutan: kamar dulu lalu kategori khusus)
  const slots = [];
  allItems.forEach((it) => { for (let i = 0; i < (qty[it.key] || 0); i++) slots.push({ key: it.key, label: it.label }); });
  const pax = slots.length;

  // sinkronkan jumlah field nama dengan jumlah slot
  const qtySig = JSON.stringify(qty);
  useEffect(() => { setNames((prev) => slots.map((_, i) => prev[i] || '')); /* eslint-disable-next-line */ }, [qtySig]);
  useEffect(() => { setDobs((prev) => slots.map((_, i) => prev[i] || '')); /* eslint-disable-next-line */ }, [qtySig]);

  function setItemQty(key, delta) {
    setQty((q) => {
      const next = Math.max(0, (q[key] || 0) + delta);
      const others = Object.entries(q).reduce((s, [k, v]) => s + (k === key ? 0 : v), 0);
      if (others + next > trip.seat) return q;
      return { ...q, [key]: next };
    });
  }

  const subtotalFull = allItems.reduce((s, it) => s + it.price * (qty[it.key] || 0), 0);
  const dp = Number(trip.dp_amount || 0);
  const dpBase = dp > 0 ? dp * pax : Math.round(subtotalFull * 0.2);
  const base = payType === 'full' ? subtotalFull : dpBase;
  const amount = pax > 0 ? base + adminFee : 0;

  function submit(e) {
    e.preventDefault();
    setErr(''); setInfo(''); setNeedLogin(false);
    if (pax < 1) { setErr('Pilih minimal 1 peserta.'); return; }
    const fd = new FormData(e.target);
    if (loggedIn) {
      fd.set('lead_name', profile.name || 'Peserta');
      fd.set('lead_phone', profile.phone || '');
      fd.set('lead_email', profile.email || '');
    }
    const email = (fd.get('lead_email') || '').toString().trim();
    if (makeAcc && !loggedIn) {
      if (!email) { setErr('Email wajib diisi untuk membuat akun peserta.'); return; }
      if (pwd.length < 6) { setErr('Password minimal 6 karakter.'); return; }
      if (pwd !== pwd2) { setErr('Konfirmasi password tidak sama.'); return; }
      fd.set('password', pwd);
    }
    for (let i = 0; i < slots.length; i++) {
      const e2 = dobError(slots[i].key, dobs[i]);
      if (e2) { setErr(`Peserta ${i + 1} (${slots[i].label}): ${e2}`); return; }
    }
    const paxList = slots.map((s, i) => ({ key: s.key, label: s.label, name: (names[i] || '').trim(), dob: dobs[i] || '' }));
    fd.set('trip_id', trip.id);
    fd.set('pax_list', JSON.stringify(paxList));
    fd.set('payment_type', payType);
    startTransition(async () => {
      const r = await createBooking(fd);
      if (r?.error) { setErr(r.error); setNeedLogin(!!r.needLogin); return; }
      // Buat sesi (kalau akun baru) supaya pesanan otomatis ke akun, TAPI tetap arahkan
      // ke halaman pesanan biar peserta bisa langsung klik Bayar (Midtrans).
      if (makeAcc && !loggedIn && r.account === 'created' && r.email) {
        try { await createClient().auth.signInWithPassword({ email: r.email, password: pwd }); } catch {}
      }
      const q = (makeAcc && !loggedIn && r.account === 'exists') ? '?acc=exists' : '';
      router.push(`/order/${r.id}${q}`);
    });
  }

  const inp = 'w-full mt-1 px-3 py-2.5 border border-slate-300 rounded-xl text-sm';
  const Stepper = ({ it }) => (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
      <div className="pr-2">
        <p className="text-sm font-semibold text-slate-800">{it.label}</p>
        <p className="text-xs font-bold text-slate-700">{fmtRp(it.price)} / orang</p>
        {it.addons?.length > 0 && it.base > 0 && (
          <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
            {it.label} {fmtRp(it.base)}{it.addons.map((a, k) => ` + ${a.label} ${fmtRp(a.value)}`).join('')}
          </p>
        )}
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
      {/* honeypot anti-bot — jangan diisi */}
      <input type="text" name="website_url" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
      {loggedIn ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-sm">
          <p className="text-emerald-800 font-semibold">Pesan sebagai <b>{profile.name || 'akun kamu'}</b></p>
          <p className="text-emerald-700 text-xs">{profile.phone}{profile.email ? ` · ${profile.email}` : ''} · pesanan otomatis masuk akunmu</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block"><span className="text-xs font-bold text-slate-600">Nama Pemesan *</span>
            <input name="lead_name" required placeholder="Nama lengkap" className={inp} /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">No HP / WhatsApp *</span>
            <input name="lead_phone" required placeholder="0812..." className={inp} /></label>
          <label className="block sm:col-span-2"><span className="text-xs font-bold text-slate-600">Email {makeAcc ? '*' : ''}</span>
            <input name="lead_email" type="email" placeholder="email@kamu.com" className={inp} /></label>
        </div>
      )}

      {items.rooms?.length > 0 && (
        <div className="border border-slate-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-slate-800">🛏 Kamar (pilih jumlah orang)</p>
          <p className="text-[11px] text-slate-400 mb-1">Double = 2 orang, Triple = 3 orang, dst. Harga per orang.</p>
          {items.rooms.map((it) => <Stepper key={it.key} it={it} />)}
        </div>
      )}

      {items.specials?.length > 0 && (
        <div className="border border-slate-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-slate-800">👶 Kategori Khusus</p>
          <p className="text-[11px] text-slate-400 mb-1">Child no bed, infant, atau land tour only — bisa digabung dgn kamar.</p>
          {items.specials.map((it) => <Stepper key={it.key} it={it} />)}
        </div>
      )}

      {/* Nama tiap peserta */}
      {pax > 0 && (
        <div className="border border-slate-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-slate-800">🧍 Data Peserta ({pax} orang)</p>
          <p className="text-[11px] text-slate-400 mb-2">Isi nama tiap peserta (sesuai paspor) — boleh dikosongkan, bisa dilengkapi nanti.</p>
          <div className="space-y-2">
            {slots.map((s, i) => { const de = needsDob(s.key) ? dobError(s.key, dobs[i]) : null; return (
              <div key={i}>
                <span className="text-xs font-semibold text-slate-600">Peserta {i + 1} — {s.label}</span>
                <input value={names[i] || ''} onChange={(e) => setNames((p) => p.map((v, j) => j === i ? e.target.value : v))}
                  placeholder="Nama lengkap" className="w-full mt-0.5 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                {needsDob(s.key) && (
                  <div className="mt-1.5">
                    <span className="text-[11px] font-semibold text-slate-600">📅 Tanggal lahir anak {s.key === 'infant' ? '(infant — maks 24 bulan saat pulang)' : '(child no bed — maks 12 tahun saat pulang)'}</span>
                    <input type="date" value={dobs[i] || ''} max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setDobs((p) => p.map((v, j) => j === i ? e.target.value : v))}
                      className={`w-full mt-0.5 px-3 py-2.5 border rounded-lg text-sm ${de ? 'border-red-400 bg-red-50' : 'border-slate-300'}`} />
                    <p className="text-[11px] text-slate-400 mt-0.5">Klik kolom di atas untuk pilih dari kalender.</p>
                    {!de && dobs[i] && ageText(dobs[i]) && <p className="text-[11px] text-emerald-600 mt-0.5 font-semibold">✓ Umur saat pulang: {ageText(dobs[i])}</p>}
                    {de && <p className="text-[11px] text-red-600 mt-0.5">{de}</p>}
                  </div>
                )}
              </div>
            ); })}
          </div>
        </div>
      )}

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
              <p className="sm:col-span-2 text-[11px] text-slate-500">Pakai email yang <b>belum pernah</b> dipakai daftar. Sudah punya akun? <a href="/masuk" className="font-bold text-emerald-600 underline">Masuk dulu</a>.</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-emerald-700 bg-emerald-50 rounded-xl p-2.5">✓ Kamu sudah login — pesanan otomatis masuk ke akunmu.</p>
      )}

      {info && <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">{info}</div>}
      {err && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">⚠ {err}{needLogin && <> <a href="/masuk" className="font-bold underline">Masuk sekarang →</a></>}</div>}

      <button type="submit" disabled={pending || pax < 1 || slots.some((s, i) => !!dobError(s.key, dobs[i]))} className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-lg">
        {pending ? 'Memproses...' : 'Lanjut ke Pembayaran →'}
      </button>
      <p className="text-[11px] text-center text-slate-400">Dengan memesan, kamu setuju dengan syarat & ketentuan trip.</p>
    </form>
  );
}
