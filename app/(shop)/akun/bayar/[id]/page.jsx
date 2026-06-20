import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getBooking, ADMIN_FEE_ONLINE } from '@/lib/shop/data';
import { getBookingPaymentPlan } from '@/lib/shop/payments';
import { storefrontConfig } from '@/lib/shop/storefront-config';
import { resolveBrandCode } from '@/lib/brand-shared';
import PayNextButton from '@/components/shop/PayNextButton';
import ManualPayPanel from '@/components/shop/ManualPayPanel';

export const dynamic = 'force-dynamic';
function fmtRp(n){return 'Rp '+Number(n||0).toLocaleString('id-ID');}
function brandCode(){ try{const h=headers();return h.get('x-brand')||resolveBrandCode({host:h.get('host')});}catch{return 'teone';} }

export default async function BayarLanjutanPage({ params }) {
  const { id } = await params;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/masuk');

  const b = await getBooking(id);
  if (!b) notFound();
  // ownership: email cocok / customer milik user
  const email = (user.email || '').toLowerCase();
  const ownByEmail = (b.lead_email || '').toLowerCase() === email;
  if (!ownByEmail) {
    const { data: cust } = await supabase.from('customers').select('id').eq('user_id', user.id).limit(1).maybeSingle();
    if (!cust || cust.id !== b.customer_id) redirect('/akun');
  }

  const plan = await getBookingPaymentPlan(b);
  const cfg = storefrontConfig(brandCode());
  const next = plan?.nextUnpaid;

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <Link href="/akun" className="text-sm text-slate-500 hover:underline">← Kembali ke Akun</Link>
      <h1 className="text-2xl font-extrabold text-slate-900 mt-2">Bayar Lanjutan</h1>
      <p className="text-slate-500 text-sm">{b.trip?.name} · Order {b.order_code} · {plan?.paxCount} peserta</p>

      {/* Ringkasan */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-slate-200 p-3"><p className="text-[11px] text-slate-500">Total Paket</p><p className="font-extrabold text-slate-900 text-sm">{fmtRp(plan?.pokokTotal ?? plan?.milestoneTotal)}</p></div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-[11px] text-slate-500">Sudah Dibayar</p><p className="font-extrabold text-emerald-700 text-sm">{fmtRp(plan?.pokokPaid ?? plan?.totalPaid)}</p></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-[11px] text-slate-500">Sisa</p><p className="font-extrabold text-amber-700 text-sm">{fmtRp(plan?.pokokSisa ?? plan?.sisa)}</p></div>
      </div>

      {/* Daftar termin */}
      <div className="mt-5 border border-slate-200 rounded-2xl divide-y divide-slate-100">
        {(plan?.milestones || []).map((m) => (
          <div key={m.type} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-semibold text-slate-800 text-sm">{m.label}</p>
              <p className="text-xs text-slate-400">{fmtRp(m.perPax)} × {plan.paxCount}</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-slate-900 text-sm">{fmtRp(m.total)}</p>
              {m.paid ? <span className="text-[11px] font-bold text-emerald-600">✓ Lunas</span>
                : next && next.type === m.type ? <span className="text-[11px] font-bold text-amber-600">Jatuh tempo</span>
                : <span className="text-[11px] text-slate-400">belum</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Bayar termin berikutnya */}
      {next ? (
        <div className="mt-6 space-y-4">
          <div className="text-center">
            <p className="text-sm text-slate-500">Bayar termin berikutnya</p>
            <p className="text-lg font-extrabold text-slate-900">{next.label} · {fmtRp(next.total)}</p>
          </div>
          <PayNextButton bookingId={b.id} milestoneType={next.type} label={next.label} total={next.total} adminFee={ADMIN_FEE_ONLINE} />
          <div className="relative text-center"><span className="text-xs text-slate-400 bg-white px-2">atau</span><div className="absolute top-1/2 inset-x-0 -z-10 border-t border-slate-200" /></div>
          <ManualPayPanel booking={{ id: b.id, order_code: b.order_code, trip_id: b.trip_id, lead_name: b.lead_name }} bank={cfg.bank} waNumber={cfg.waNumber} milestoneType={next.type} total={next.total} />
        </div>
      ) : (
        <div className="mt-6 text-center bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-emerald-800 font-bold">🎉 Semua pembayaran sudah lunas!</div>
      )}
    </div>
  );
}
