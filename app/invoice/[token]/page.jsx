// Round 110: Invoice page — SELALU tampil Total Dibayar + Sisa Tagihan
// Fix: roomTypeToKey smart mapping (Twin→double, dll)
// Fix: section "Sudah Dibayar + Sisa" SELALU tampil walaupun breakdown kosong

import SignedFileLink from '@/components/common/SignedFileLink';
import { notFound } from 'next/navigation';
import { createPublicClient as createClient } from '@/lib/supabase/server';
import { getExpectedAndPaidForPassenger } from '@/lib/actions/invoices';
import { getInvoiceBilling } from '@/lib/shop/invoice-bill';

export const dynamic = 'force-dynamic';

function fmtRupiah(n) { return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); }
function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch { return s; }
}

// Smart mapping room_type → breakdown key (dari lib/utils/price-breakdown.js)
function roomTypeToKey(roomType) {
  if (!roomType) return null;
  const t = String(roomType).toLowerCase().trim();
  if (t.includes('quad')) return 'quad';
  if (t.includes('triple')) return 'triple';
  if (t.includes('double') || t.includes('twin')) return 'double';
  if (t.includes('single')) return 'single';
  if (t.includes('family')) return 'family';
  if (t.includes('child')) return 'child_no_bed';
  if (t.includes('infant')) return 'infant';
  return null;
}

const STATUS_BADGE = {
  draft: { label: 'Draft', color: 'bg-slate-200 text-slate-700' },
  sent: { label: 'Belum Dibayar', color: 'bg-amber-100 text-amber-800' },
  paid: { label: '✅ LUNAS', color: 'bg-green-100 text-green-800' },
  overdue: { label: '⚠ Overdue', color: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelled', color: 'bg-slate-100 text-slate-500' },
};

async function loadClientComponents() {
  const result = { PaymentProofForm: null, PrintInvoiceButton: null, InvoicePayOnlineButton: null, errors: [] };
  try {
    const mod = await import('@/components/invoice/PaymentProofForm');
    result.PaymentProofForm = mod.default;
  } catch (e) { result.errors.push(`PaymentProofForm: ${e.message}`); }
  try {
    const mod = await import('@/components/invoice/InvoicePayOnlineButton');
    result.InvoicePayOnlineButton = mod.default;
  } catch (e) { result.errors.push(`InvoicePayOnlineButton: ${e.message}`); }
  try {
    const mod = await import('@/components/invoice/PrintInvoiceButton');
    result.PrintInvoiceButton = mod.default;
  } catch (e) { result.errors.push(`PrintInvoiceButton: ${e.message}`); }
  return result;
}

export default async function PublicInvoicePage({ params }) {
  const errors = [];
  let token = '';
  try {
    const p = await Promise.resolve(params);
    token = p?.token || '';
  } catch (e) { errors.push(`params: ${e.message}`); }

  if (!token) return <ErrorBox title="Token kosong" errors={['Tidak ada token di URL']} />;

  let supabase;
  try { supabase = createClient(); }
  catch (e) { return <ErrorBox title="DB init gagal" errors={[e.message]} />; }

  // Fetch invoice
  let inv = null;
  try {
    const { data, error } = await supabase
      .from('invoices').select('*').eq('public_token', token).maybeSingle();
    if (error) errors.push(`invoice: ${error.message}`);
    inv = data;
  } catch (e) { errors.push(`invoice fetch: ${e.message}`); }

  if (!inv) return <ErrorBox title="Invoice tidak ditemukan" errors={[`Token: ${token}`, ...errors]} />;

  // Self-heal: invoice belum lunas tapi sudah settle di Midtrans (webhook telat/terlewat) → proses lalu muat ulang.
  if (inv.status !== 'paid' && !inv.paid_at && inv.midtrans_order_id) {
    try {
      const { headers } = await import('next/headers');
      const { resolveBrandCode } = await import('@/lib/brand-shared');
      let _brand = 'teone';
      try { const h = headers(); _brand = h.get('x-brand') || resolveBrandCode({ host: h.get('host') }) || 'teone'; } catch {}
      const { reconcileInvoiceOnline } = await import('@/lib/shop/fulfillment');
      const healed = await reconcileInvoiceOnline(_brand, inv);
      if (healed) {
        const { data: fresh } = await supabase.from('invoices').select('*').eq('public_token', token).maybeSingle();
        if (fresh) inv = fresh;
      }
    } catch {}
  }

  // Fetch company
  let company = {};
  try {
    const { data } = await supabase.from('brands').select('*, company_name:name, company_logo_url:logo_url').eq('id', inv.brand_id || 1).maybeSingle();
    company = data || {};
  } catch (e) { errors.push(`company: ${e.message}`); }

  // Fetch payments untuk invoice ini
  let payments = [];
  try {
    const { data } = await supabase
      .from('invoice_payments').select('*')
      .eq('invoice_id', inv.id).order('created_at', { ascending: false });
    payments = data || [];
  } catch (e) { errors.push(`invoice_payments: ${e.message}`); }

  // Fetch trip
  let trip = null;
  let breakdown = {};
  if (inv.trip_id) {
    try {
      const { data } = await supabase.from('trips').select('*').eq('id', inv.trip_id).maybeSingle();
      trip = data;
      breakdown = (trip?.price_breakdown && typeof trip.price_breakdown === 'object') ? trip.price_breakdown : {};
    } catch (e) { errors.push(`trip: ${e.message}`); }
  }

  // Fetch passenger + participant_payments
  let passenger = null;
  let participantPayments = [];
  if (inv.passenger_id) {
    try {
      const { data } = await supabase.from('trip_passengers')
        .select('id, room_type, age_type, price_paid').eq('id', inv.passenger_id).maybeSingle();
      passenger = data;
    } catch (e) { errors.push(`passenger: ${e.message}`); }
    try {
      const { data } = await supabase.from('participant_payments')
        .select('*').eq('passenger_id', inv.passenger_id);
      participantPayments = data || [];
    } catch (e) { errors.push(`participant_payments: ${e.message}`); }
  }

  // === COMPUTE BREAKDOWN (smart mapping) ===
  const roomKey = roomTypeToKey(passenger?.room_type);
  const roomPrice = Number((roomKey && breakdown[roomKey]) || 0);
  const tips = Number(breakdown.tips || 0);
  const cityTax = Number(breakdown.city_tax || breakdown.cityTax || 0);
  const visaPrice = Number(breakdown.visa || 0);
  const asuransiPrice = Number(breakdown.asuransi || 0);

  const paidTypes = new Set(participantPayments.map((p) => p.type));

  // RUMUS SAMA DENGAN TEMPLATE WA — satu sumber: getExpectedAndPaidForPassenger
  let expectedTotalReal = 0;
  let totalPaidReal = 0;
  let pokokPaidReal = 0;
  let addonPaidReal = 0;
  let sisaReal = 0;
  let discountReal = 0;
  let famRoom = 0, famTips = 0, famCity = 0, famFlight = 0, famBaggage = 0, famBase = 0, famVisa = 0, famAsuransi = 0, famCount = 1, famResolved = false;
  if (inv.trip_id && (inv.passenger_id || (Array.isArray(inv.covers_passenger_ids) && inv.covers_passenger_ids.length))) {
    try {
      const bill = await getInvoiceBilling(supabase, inv);
      expectedTotalReal = bill.expectedTotal;
      totalPaidReal = bill.totalPaid;
      pokokPaidReal = bill.pokokPaid;
      addonPaidReal = bill.addonPaid;
      sisaReal = bill.sisa;
      discountReal = bill.discount;
      famRoom = bill.members.reduce((t, m) => t + (m.roomPrice || 0), 0);
      famTips = bill.members.reduce((t, m) => t + (m.tips || 0), 0);
      famCity = bill.members.reduce((t, m) => t + (m.cityTax || 0), 0);
      famFlight = bill.members.reduce((t, m) => t + (m.flight || 0), 0);
      famBaggage = bill.members.reduce((t, m) => t + (m.baggage || 0), 0);
      famBase = bill.members.reduce((t, m) => t + (m.baseFee || 0), 0);
      famVisa = Number(bill.visaExpected) || 0;
      famAsuransi = Number(bill.asuransiExpected) || 0;
      famCount = bill.count || 1;
      famResolved = true;
    } catch (e) { errors.push(`summary: ${e.message}`); }
  } else {
    totalPaidReal = participantPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  }

  const optItems = [];
  // Family-aware: jumlahkan visa/asuransi semua anggota yang mengambilnya (bukan 1 orang)
  const visaAmt = famResolved ? famVisa : (paidTypes.has('Visa') ? visaPrice : 0);
  const asuransiAmt = famResolved ? famAsuransi : (paidTypes.has('Asuransi') ? asuransiPrice : 0);
  if (visaAmt > 0) optItems.push({ label: famCount > 1 ? `Visa (${famCount} peserta)` : 'Visa', amount: visaAmt });
  if (asuransiAmt > 0) optItems.push({ label: famCount > 1 ? `Asuransi (${famCount} peserta)` : 'Asuransi', amount: asuransiAmt });

  const isLunas = expectedTotalReal > 0 && sisaReal === 0;

  // Tour breakdown items
  const tourItems = [];
  const paxNote = famCount > 1 ? ` (${famCount} peserta)` : '';
  const rTips = famResolved ? famTips : tips;
  const rCity = famResolved ? famCity : cityTax;
  // Paket Tour = total pokok (harga jual/price_paid, sudah net diskon + diskon ditambah balik)
  //   dikurangi komponen yg ditampilkan terpisah → supaya baris2 PASTI menjumlah ke TOTAL PAKET.
  const _pokokGross = (Number(expectedTotalReal) || 0) + (Number(discountReal) || 0);
  const _extras = (rTips || 0) + (rCity || 0) + (famFlight || 0) + (famBaggage || 0) + (famBase || 0);
  let rRoom = _pokokGross > 0 ? Math.max(_pokokGross - _extras, 0) : (famCount > 1 ? famRoom : (famRoom || roomPrice));
  if (rRoom > 0) tourItems.push({ label: `Paket Tour${famCount > 1 ? paxNote : ` (${passenger?.room_type || 'Room'})`}`, amount: rRoom });
  if (famBase > 0) tourItems.push({ label: `Harga Dasar${paxNote}`, amount: famBase });
  if (famFlight > 0) tourItems.push({ label: `Tiket Pesawat Domestik${paxNote}`, amount: famFlight });
  if (famBaggage > 0) tourItems.push({ label: `Bagasi Domestik${paxNote}`, amount: famBaggage });
  if (rTips > 0) tourItems.push({ label: `Tips${paxNote}`, amount: rTips });
  if (rCity > 0) tourItems.push({ label: `City Tax${paxNote}`, amount: rCity });
  for (const opt of optItems) tourItems.push({ label: opt.label, amount: opt.amount, detail: 'opt-in' });
  if (discountReal > 0) tourItems.push({ label: 'Diskon', amount: -discountReal, detail: 'potongan' });

  // Sisa untuk invoice ini
  const totalPaidThisInvoice = (payments || [])
    .filter((p) => p.status === 'verified')
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const sisaInvoice = Math.max(Number(inv.amount || 0) - totalPaidThisInvoice, 0);
  const status = STATUS_BADGE[inv.status] || STATUS_BADGE.sent;

  const { PaymentProofForm, PrintInvoiceButton, InvoicePayOnlineButton, errors: clientErrors } = await loadClientComponents();
  errors.push(...clientErrors);

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .invoice-card { box-shadow: none !important; border: none !important; }
          .min-h-screen { min-height: auto !important; padding: 0 !important; }
        }
      `}} />

      {errors.length > 0 && (
        <div className="max-w-2xl mx-auto mb-4 bg-amber-50 border border-amber-300 rounded-lg p-4 no-print">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2">⚠ Warnings (debug)</p>
          <ul className="text-xs text-amber-900 space-y-1 ml-4 list-disc">
            {errors.map((e, i) => <li key={i} className="font-mono">{e}</li>)}
          </ul>
        </div>
      )}

      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden invoice-card">
        {/* Header */}
        <div className="bg-gradient-to-r from-brand-600 to-brand-800 text-white p-6">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              {company.company_logo_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={company.company_logo_url} alt={company.company_name || 'Logo'} className="h-12 mb-2 bg-white rounded p-1" />
              )}
              <h1 className="text-2xl font-bold">{company.company_name || 'Traveling Eropa'}</h1>
              {company.company_address && <p className="text-xs mt-1 opacity-90 whitespace-pre-line">{company.company_address}</p>}
              {company.company_phone && <p className="text-xs opacity-90">📞 {company.company_phone}</p>}
              {company.company_email && <p className="text-xs opacity-90">✉ {company.company_email}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs opacity-90">INVOICE</p>
              <p className="text-xl font-bold font-mono">{inv.invoice_no || '—'}</p>
              <span className={`mt-2 inline-block text-xs font-bold px-3 py-1 rounded-full ${status.color}`}>
                {status.label}
              </span>
            </div>
          </div>
        </div>

        {/* Customer & Trip Info */}
        <div className="p-6 border-b border-slate-200">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Ditagih Kepada</p>
              <p className="font-bold text-slate-800">{inv.customer_name || passenger?.name || '—'}</p>
              {inv.customer_phone && <p className="text-xs text-slate-600">📞 {inv.customer_phone}</p>}
              {inv.customer_email && <p className="text-xs text-slate-600">✉ {inv.customer_email}</p>}
              {passenger?.room_type && <p className="text-xs text-slate-600 mt-1">🛏 {passenger.room_type}</p>}
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Trip</p>
              <p className="font-bold text-slate-800">{inv.trip_name || trip?.name || inv.trip_id || '—'}</p>
              {(inv.trip_kode || trip?.kode_trip) && <p className="text-xs text-slate-600 font-mono">{inv.trip_kode || trip?.kode_trip}</p>}
              {trip?.destination && <p className="text-xs text-slate-600 mt-0.5">{trip.destination}</p>}
              {trip?.departure && (
                <p className="text-xs text-slate-600 mt-0.5">
                  ✈ {fmtDate(trip.departure)}{trip.arrival ? ` → ${fmtDate(trip.arrival)}` : ''}
                </p>
              )}
              {inv.due_date && <p className="text-xs text-slate-600 mt-1">Due: <span className="font-bold">{fmtDate(inv.due_date)}</span></p>}
              {inv.paid_at && inv.status === 'paid' && (
                <p className="text-xs text-green-700 mt-1">Paid: <span className="font-bold">{fmtDate(inv.paid_at)}</span></p>
              )}
            </div>
          </div>
        </div>

        {/* BREAKDOWN PAKET TOUR (kalau ada breakdown) */}
        {tourItems.length > 0 && (
          <div className="p-6 border-b border-slate-200 bg-blue-50/30">
            <p className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-3">📋 Breakdown Paket Tour</p>
            <table className="w-full">
              <tbody className="divide-y divide-blue-100">
                {tourItems.map((item, i) => (
                  <tr key={i}>
                    <td className="py-1.5 text-sm">
                      <p className="font-semibold text-slate-800">{item.label}</p>
                      {item.detail && <p className="text-[10px] text-slate-500">{item.detail}</p>}
                    </td>
                    <td className="py-1.5 text-right font-bold text-slate-800">{fmtRupiah(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-blue-300">
                <tr>
                  <td className="pt-2 text-sm font-bold text-blue-800">TOTAL PAKET</td>
                  <td className="pt-2 text-right font-bold text-lg text-blue-800">{fmtRupiah(expectedTotalReal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Tagihan Saat Ini */}
        <div className="p-6">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            {inv.status === 'paid' ? '✅ Pembayaran Diterima' : '📄 Tagihan Saat Ini'}
          </p>
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="px-3 py-2">Milestone</th>
                <th className="px-3 py-2 text-right">Jumlah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-3 py-3">
                  <p className="font-semibold text-slate-800">{inv.milestone || '—'}</p>
                  {inv.description && <p className="text-xs text-slate-500">{inv.description}</p>}
                </td>
                <td className="px-3 py-3 text-right font-bold text-slate-800">{fmtRupiah(inv.amount)}</td>
              </tr>
            </tbody>
            <tfoot className="bg-slate-50">
              <tr>
                <td className="px-3 py-3 text-right font-bold text-slate-700">TOTAL TAGIHAN INVOICE INI</td>
                <td className="px-3 py-3 text-right font-bold text-2xl text-brand-700">{fmtRupiah(inv.amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ============================================== */}
        {/* SELALU TAMPIL: Total Dibayar + Sisa Tagihan    */}
        {/* ============================================== */}
        <div className={`p-6 border-t-2 border-b-2 ${isLunas ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'}`}>
          <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isLunas ? 'text-green-800' : 'text-amber-800'}`}>
            📊 Ringkasan Pembayaran Trip
          </p>
          <div className="space-y-2 text-sm">
            {expectedTotalReal > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-700">Total Tagihan Pokok Trip:</span>
                <span className="font-bold text-slate-800">{fmtRupiah(expectedTotalReal)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-green-700 font-semibold">✅ Dibayar (pokok):</span>
              <span className="font-bold text-green-700 text-lg">{fmtRupiah(pokokPaidReal)}</span>
            </div>
            {addonPaidReal > 0 && (
              <div className="flex justify-between">
                <span className="text-sky-700 font-semibold">➕ Pembayaran lain (visa/ongkir/optional):</span>
                <span className="font-bold text-sky-700">{fmtRupiah(addonPaidReal)}</span>
              </div>
            )}
            {participantPayments.length > 0 && (
              <div className="ml-3 text-xs text-slate-600 space-y-0.5 bg-white/50 rounded p-2">
                {participantPayments.map((p, i) => (
                  <div key={i} className="flex justify-between">
                    <span>✓ {p.type}{p.paid_at ? ` · ${fmtDate(p.paid_at)}` : ''}</span>
                    <span className="font-semibold">{fmtRupiah(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            {participantPayments.length === 0 && (
              <p className="ml-3 text-xs italic text-slate-500">Belum ada pembayaran tercatat</p>
            )}
            <div className={`flex justify-between pt-3 mt-2 border-t-2 ${isLunas ? 'border-green-400' : 'border-amber-400'}`}>
              <span className={`font-bold text-base ${isLunas ? 'text-green-800' : 'text-amber-800'}`}>
                {isLunas ? '🎉 POKOK LUNAS' : '⚠ Sisa Pembayaran Pokok:'}
              </span>
              <span className={`font-bold text-2xl ${isLunas ? 'text-green-700' : 'text-amber-700'}`}>
                {isLunas ? '✓' : fmtRupiah(sisaReal)}
              </span>
            </div>
            {expectedTotalReal === 0 && (
              <p className="text-[11px] italic text-amber-700 mt-1">
                ⓘ Total tagihan trip belum di-set di sistem (price_breakdown / price_paid kosong)
              </p>
            )}
          </div>
        </div>

        {/* Bank Info */}
        {inv.status !== 'paid' && !inv.paid_at && (company.bank_account_no || company.bank_name) && (
          <div className="px-6 pt-4 pb-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2">💳 Transfer ke:</p>
              <p className="text-lg font-bold text-blue-900">{company.bank_name}</p>
              {company.bank_account_no && (
                <p className="font-mono text-xl font-bold text-blue-900 select-all">{company.bank_account_no}</p>
              )}
              {company.bank_account_name && (
                <p className="text-sm text-blue-800">a.n. {company.bank_account_name}</p>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {PrintInvoiceButton && (
          <div className="px-6 pb-4 no-print">
            <div className="flex gap-2 flex-wrap">
              <PrintInvoiceButton invoiceNo={inv.invoice_no} />
            </div>
          </div>
        )}

        {/* Payment Proof Form — tampil utk SEMUA invoice yg belum lunas (pokok / visa / ongkir / cicilan) */}
        {inv.status !== 'paid' && !inv.paid_at && (
          <div className="px-6 pb-6 no-print">
            {InvoicePayOnlineButton && <InvoicePayOnlineButton token={inv.public_token} amount={sisaInvoice || inv.amount} />}
            {PaymentProofForm && (
              <>
                <p className="text-[11px] text-slate-500 mt-3 mb-1 font-semibold">🏦 Apabila menggunakan transfer bank, upload bukti transfer di bawah ini:</p>
                <PaymentProofForm token={inv.public_token} expectedAmount={sisaInvoice || inv.amount} />
              </>
            )}
          </div>
        )}

        {/* Payment History */}
        {payments && payments.length > 0 && (
          <div className="px-6 pb-6">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Riwayat Pembayaran Invoice Ini</p>
            <div className="space-y-2">
              {payments.map((p) => (
                <div key={p.id} className={`p-3 rounded border text-xs ${
                  p.status === 'verified' ? 'bg-green-50 border-green-200' :
                  p.status === 'rejected' ? 'bg-red-50 border-red-200' :
                  'bg-amber-50 border-amber-200'
                }`}>
                  <div className="flex justify-between flex-wrap gap-2">
                    <div>
                      <p className="font-bold">{fmtRupiah(p.amount)}</p>
                      <p className="text-[10px]">{fmtDate(p.payment_date)} · {p.payment_method || '—'}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-[10px] font-bold uppercase ${
                        p.status === 'verified' ? 'text-green-700' :
                        p.status === 'rejected' ? 'text-red-700' :
                        'text-amber-700'
                      }`}>
                        {p.status === 'verified' ? '✓ Diverifikasi' :
                         p.status === 'rejected' ? '✕ Ditolak' :
                         '⏳ Menunggu Verifikasi'}
                      </span>
                      {p.proof_url && (
                        <SignedFileLink url={p.proof_url} className="block mt-1 text-[10px] underline no-print cursor-pointer">Lihat bukti</SignedFileLink>
                      )}
                    </div>
                  </div>
                  {p.note_from_customer && <p className="mt-1 italic text-slate-600">"{p.note_from_customer}"</p>}
                  {p.reject_reason && <p className="mt-1 text-red-700">Reason: {p.reject_reason}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 text-center text-xs text-slate-600 border-t border-slate-200">
          {company.invoice_footer_note || 'Terima kasih atas kepercayaan Anda.'}
        </div>
      </div>
    </div>
  );
}

function ErrorBox({ title, errors }) {
  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg p-6">
        <h1 className="text-xl font-bold text-red-700 mb-3">⚠ {title}</h1>
        <ul className="text-xs text-slate-700 space-y-1 ml-4 list-disc">
          {(errors || []).map((e, i) => <li key={i} className="font-mono">{e}</li>)}
        </ul>
        <p className="mt-4 text-xs text-slate-500">Kalau ini terus muncul, kontak admin TEONE.</p>
      </div>
    </div>
  );
}
