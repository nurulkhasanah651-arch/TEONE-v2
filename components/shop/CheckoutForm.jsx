'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createBooking } from '@/lib/actions/shop-checkout';
import { createClient } from '@/lib/supabase/client';

function fmtRp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }

export default function CheckoutForm({ trip }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState('');
  const rooms = Array.isArray(trip.roomPrices) ? trip.roomPrices : [];
  const [pax, setPax] = useState(1);
  const [payType, setPayType] = useState('dp');
  const [room, setRoom] = useState(rooms[0]?.label || 'Double');
  const [makeAcc, setMakeAcc] = useState(true);
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');

  const selected = rooms.find((r) => r.label === room);
  const unit = selected ? selected.price : (trip.public_price || 0);
  const dp = trip.dp_amount || 0;
  const amount = payType === 'full' ? unit * pax : (dp > 0 ? dp * pax : Math.round(unit * 0.2) * pax);

  function submit(e) {
    e.preventDefault();
    setErr('');
    const fd = new FormData(e.target);
    const email = (fd.get('lead_email') || '').toString().trim();
    if (makeAcc) {
      if (!email) { setErr('Email wajib diisi untuk membuat akun peserta.'); return; }
      if (pwd.length < 6) { setErr('Password minimal 6 karakter.'); return; }
      if (pwd !== pwd2) { setErr('Konfirmasi password tidak sama.'); return; }
      fd.set('password', pwd);
    }
    fd.set('trip_id', trip.id);
    fd.set('pax_count', String(pax));
    fd.set('payment_type', payType);
    startTransition(async () => {
      const r = await createBooking(fd);
      if (r?.error) { setErr(r.error); return; }
      // Bila akun dibuat / sudah ada → auto login lalu ke portal peserta
      if (makeAcc && (r.account === 'created' || r.account === 'exists') && r.email) {
        try {
          const supabase = createClient();
          const { error: sErr } = await supabase.auth.signInWithPassword({ email: r.email, password: pwd });
          if (!sErr) { router.push('/akun'); return; }
        } catch { /* fallback ke order */ }
      }
      router.push(`/order/${r.id}`);
    });
  }

  const inp = 'w-full mt-1 px-3 py-2.5 border border-slate-300 rounded-xl text-sm';
  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block"><span className="text-xs font-bold text-slate-600">Nama Lengkap *</span>
          <input name="lead_name" required placeholder="Nama sesuai paspor" className={inp} /></label>
        <label className="block"><span className="text-xs font-bold text-slate-600">No HP / WhatsApp *</span>
          <input name="lead_phone" required placeholder="0812..." className={inp} /></label>
        <label className="block"><span className="text-xs font-bold text-slate-600">Email</span>
          <input name="lead_email" type="email" placeholder="email@kamu.com" className={inp} /></label>
        <label className="block"><span className="text-xs font-bold text-slate-600">Tipe Kamar</span>
          {rooms.length ? (
            <select name="room_type" value={room} onChange={(e) => setRoom(e.target.value)} className={inp + ' bg-white'}>
              {rooms.map((r) => <option key={r.key} value={r.label}>{r.label} — {fmtRp(r.price)}</option>)}
            </select>
          ) : (
            <select name="room_type" className={inp + ' bg-white'}>{['Double','Twin','Triple','Single'].map((r) => <option key={r} value={r}>{r}</option>)}</select>
          )}</label>
      </div>

      <label className="block"><span className="text-xs font-bold text-slate-600">Jumlah Peserta</span>
        <div className="flex items-center gap-3 mt-1">
          <button type="button" onClick={() => setPax((p) => Math.max(1, p - 1))} className="w-9 h-9 rounded-lg border border-slate-300 font-bold">−</button>
          <span className="font-bold text-lg w-8 text-center">{pax}</span>
          <button type="button" onClick={() => setPax((p) => Math.min(trip.seat, p + 1))} className="w-9 h-9 rounded-lg border border-slate-300 font-bold">+</button>
          <span className="text-xs text-slate-400">maks {trip.seat} seat</span>
        </div></label>

      <div>
        <span className="text-xs font-bold text-slate-600">Pilih Pembayaran</span>
        <div className="grid grid-cols-2 gap-3 mt-1">
          <button type="button" onClick={() => setPayType('dp')} className={`p-3 rounded-xl border-2 text-left ${payType === 'dp' ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`} disabled={dp <= 0}>
            <p className="font-bold text-slate-800">Bayar DP</p>
            <p className="text-xs text-slate-500">{dp > 0 ? fmtRp(dp) + ' /pax' : 'tidak tersedia'}</p>
          </button>
          <button type="button" onClick={() => setPayType('full')} className={`p-3 rounded-xl border-2 text-left ${payType === 'full' ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
            <p className="font-bold text-slate-800">Bayar Lunas</p>
            <p className="text-xs text-slate-500">{fmtRp(unit)} /pax</p>
          </button>
        </div>
      </div>

      <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between">
        <div>
          <p className="text-xs opacity-80">Total bayar sekarang ({payType === 'full' ? 'Lunas' : 'DP'})</p>
          <p className="text-2xl font-extrabold">{fmtRp(amount)}</p>
        </div>
      </div>

      {/* Buat akun peserta */}
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
            <p className="sm:col-span-2 text-[11px] text-slate-500">Pakai <b>email</b> di atas untuk login nanti di halaman <b>Masuk</b>. Sudah punya akun? Login dulu saja.</p>
          </div>
        )}
      </div>

      {err && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">⚠ {err}</div>}

      <button type="submit" disabled={pending} className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-lg">
        {pending ? 'Memproses...' : 'Lanjut ke Pembayaran →'}
      </button>
      <p className="text-[11px] text-center text-slate-400">Dengan memesan, kamu setuju dengan syarat & ketentuan trip.</p>
    </form>
  );
}
