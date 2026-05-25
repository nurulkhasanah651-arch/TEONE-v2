// Round 109: SAFE MODE — wrap everything in try/catch, log all errors visible
// All non-critical sections fail gracefully so we can see what's actually breaking

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function fmtRupiah(n) { return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); }
function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch { return s; }
}
function roomTypeKey(rt) {
  if (!rt) return '';
  return String(rt).toLowerCase().replace(/[^a-z_]/g, '');
}

const STATUS_BADGE = {
  draft: { label: 'Draft', color: 'bg-slate-200 text-slate-700' },
  sent: { label: 'Belum Dibayar', color: 'bg-amber-100 text-amber-800' },
  paid: { label: '✅ LUNAS', color: 'bg-green-100 text-green-800' },
  overdue: { label: '⚠ Overdue', color: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelled', color: 'bg-slate-100 text-slate-500' },
};

// Lazy dynamic imports for components yang mungkin missing
async function loadClientComponents() {
  const result = { PaymentProofForm: null, PrintInvoiceButton: null, errors: [] };
  try {
    const mod = await import('@/components/invoice/PaymentProofForm');
    result.PaymentProofForm = mod.default;
  } catch (e) {
    result.errors.push(`PaymentProofForm: ${e.message}`);
  }
  try {
    const mod = await import('@/components/invoice/PrintInvoiceButton');
    result.PrintInvoiceButton = mod.default;
  } catch (e) {
    result.errors.push(`PrintInvoiceButton: ${e.message}`);
  }
  return result;
}

export default async function PublicInvoicePage({ params }) {
  const errors = [];
  let token = '';

  // STEP 1: Get params (defensive — works for both Next 14 sync params & Next 15 async)
  try {
    const p = await Promise.resolve(params);
    token = p?.token || '';
  } catch (e) {
    errors.push(`params: ${e.message}`);
  }

  if (!token) {
    return <ErrorBox title="Token kosong" errors={['Tidak ada token di URL']} />;
  }

  // STEP 2: Init supabase
  let supabase;
  try {
    supabase = createClient();
  } catch (e) {
    return <ErrorBox title="Database client gagal init" errors={[e.message]} />;
  }

  // STEP 3: Fetch invoice
  let inv = null;
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('public_token', token)
      .maybeSingle();
    if (error) errors.push(`invoice query: ${error.message}`);
    inv = data;
  } catch (e) {
    errors.push(`invoice fetch: ${e.message}`);
  }

  if (!inv) {
    return <ErrorBox title="Invoice tidak ditemukan" errors={[`Token: ${token}`, ...errors]} />;
  }

  // STEP 4: Fetch company settings (non-critical)
  let company = {};
  try {
    const { data } = await supabase.from('company_settings').select('*').eq('id', 1).maybeSingle();
    company = data || {};
  } catch (e) {
    errors.push(`company: ${e.message}`);
  }

  // STEP 5: Fetch payments untuk invoice ini
  let payments = [];
  try {
    const { data } = await supabase
      .from('invoice_payments').select('*')
      .eq('invoice_id', inv.id).order('created_at', { ascending: false });
    payments = data || [];
  } catch (e) {
    errors.push(`invoice_payments: ${e.message}`);
  }

  // STEP 6: Fetch trip (defensive — kalau column gak ada, skip)
  let trip = null;
  let breakdown = {};
  if (inv.trip_id) {
    try {
      const { data } = await supabase.from('trips')
        .select('*').eq('id', inv.trip_id).maybeSingle();
      trip = data;
      breakdown = (trip?.price_breakdown && typeof trip.price_breakdown === 'object') ? trip.price_breakdown : {};
    } catch (e) {
      errors.push(`trip: ${e.message}`);
    }
  }

  // STEP 7: Fetch passenger + participant payments (defensive)
  let passenger = null;
  let participantPayments = [];
  if (inv.passenger_id) {
    try {
      const { data } = await supabase.from('trip_passengers')
        .select('id, room_type, age_type').eq('id', inv.passenger_id).maybeSingle();
      passenger = data;
    } catch (e) {
      errors.push(`passenger: ${e.message}`);
    }
    try {
      const { data } = await supabase.from('participant_payments')
        .select('*').eq('passenger_id', inv.passenger_id);
      participantPayments = data || [];
    } catch (e) {
      errors.push(`participant_payments: ${e.message}`);
    }
  }

  // STEP 8: Compute breakdown
  const roomKey = roomTypeKey(passenger?.room_type);
  const roomPrice = Number(breakdown[roomKey] || breakdown[passenger?.room_type] || 0);
  const tips = Number(breakdown.tips || 0);
  const cityTax = Number(breakdown.city_tax || breakdown.cityTax || 0);
  const visaPrice = Number(breakdown.visa || 0);
  const asuransiPrice = Number(breakdown.asuransi || 0);

  const paidTypes = new Set(participantPayments.map((p) => p.type));
  const totalPaidReal = participantPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

  let expectedTotalReal = roomPrice + tips + cityTax;
  const optItems = [];
  if (paidTypes.has('Visa') && visaPrice > 0) { expectedTotalReal += visaPrice; optItems.push({ label: 'Visa', amount: visaPrice }); }
  if (paidTypes.has('Asuransi') && asuransiPrice > 0) { expectedTotalReal += asuransiPrice; optItems.push({ label: 'Asuransi', amount: asuransiPrice }); }

  const sisaReal = Math.max(expectedTotalReal - totalPaidReal, 0);
  const isLunas = expectedTotalReal > 0 && sisaReal === 0;

  const tourItems = [];
  if (roomPrice > 0) tourItems.push({ label: `Paket Tour (${passenger?.room_type || 'Room'})`, amount: roomPrice });
  if (tips > 0) tourItems.push({ label: 'Tips', amount: tips });
  if (cityTax > 0) tourItems.push({ label: 'City Tax', amount: cityTax });
  for (const opt of optItems) tourItems.push({ label: opt.label, amount: opt.amount, detail: 'opt-in' });

  const totalPaidThisInvoice = (payments || [])
    .filter((p) => p.status === 'verified')
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const sisaInvoice = Math.max(Number(inv.amount) - totalPaidThisInvoice, 0);
  const status = STATUS_BADGE[inv.status] || STATUS_BADGE.sent;

  // STEP 9: Load client components (dynamic, optional)
  const { PaymentProofForm, PrintInvoiceButton, errors: clientErrors } = await loadClientComponents();
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

      {/* SAFE MODE: tampilin error kalau ada */}
      {errors.length > 0 && (
        <div className="max-w-2xl mx-auto mb-4 bg-amber-50 border border-amber-300 rounded-lg p-4 no-print">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2">⚠ Warnings (page tetap jalan, ini debug info)</p>
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
              <p className="font-bold text-slate-800">{inv.customer_name || '—'}</p>
              {inv.customer_phone && <p className="text-xs text-slate-600">📞 {inv.customer_phone}</p>}
              {inv.customer_email && <p className="text-xs text-slate-600">✉ {inv.customer_email}</p>}
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

        {/* ROUND 106: BREAKDOWN PAKET TOUR */}
        {tourItems.length > 0 && inv.status !== 'paid' && (
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
                <td className="px-3 py-3 text-right font-bold text-slate-700">TOTAL TAGIHAN</td>
                <td className="px-3 py-3 text-right font-bold text-2xl text-brand-700">{fmtRupiah(inv.amount)}</td>
              </tr>
              {totalPaidThisInvoice > 0 && totalPaidThisInvoice < Number(inv.amount) && (
                <>
                  <tr>
                    <td className="px-3 py-1 text-right text-sm text-green-700">Sudah Dibayar untuk invoice ini</td>
                    <td className="px-3 py-1 text-right text-sm font-bold text-green-700">{fmtRupiah(totalPaidThisInvoice)}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1 text-right text-sm font-bold text-slate-700">Sisa invoice ini</td>
                    <td className="px-3 py-1 text-right text-sm font-bold text-amber-700">{fmtRupiah(sisaInvoice)}</td>
                  </tr>
                </>
              )}
            </tfoot>
          </table>
        </div>

        {/* ROUND 106: REAL SISA PEMBAYARAN OVERVIEW */}
        {expectedTotalReal > 0 && (
          <div className={`p-6 border-t border-b ${isLunas ? 'bg-green-50/40 border-green-200' : 'bg-amber-50/40 border-amber-200'}`}>
            <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isLunas ? 'text-green-800' : 'text-amber-800'}`}>
              📊 Ringkasan Total Pembayaran Trip
            </p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-700">Total Tagihan Trip:</span>
                <span className="font-bold text-slate-800">{fmtRupiah(expectedTotalReal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-700">Sudah Dibayar:</span>
                <span className="font-bold text-green-700">{fmtRupiah(totalPaidReal)}</span>
              </div>
              {participantPayments.length > 0 && (
                <div className="ml-3 text-xs text-slate-600 space-y-0.5">
                  {participantPayments.map((p, i) => (
                    <div key={i} className="flex justify-between">
                      <span>✓ {p.type}{p.paid_at ? ` · ${fmtDate(p.paid_at)}` : ''}</span>
                      <span>{fmtRupiah(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className={`flex justify-between pt-2 border-t-2 ${isLunas ? 'border-green-300' : 'border-amber-300'}`}>
                <span className={`font-bold ${isLunas ? 'text-green-800' : 'text-amber-800'}`}>
                  {isLunas ? '🎉 LUNAS' : 'Sisa Pembayaran:'}
                </span>
                <span className={`font-bold text-xl ${isLunas ? 'text-green-700' : 'text-amber-700'}`}>
                  {isLunas ? '✓' : fmtRupiah(sisaReal)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Bank Info */}
        {!isLunas && (company.bank_account_no || company.bank_name) && (
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

        {/* Action Buttons — render only if component loaded */}
        {PrintInvoiceButton && (
          <div className="px-6 pb-4 no-print">
            <div className="flex gap-2 flex-wrap">
              <PrintInvoiceButton invoiceNo={inv.invoice_no} />
            </div>
          </div>
        )}

        {/* Payment Proof Form — render only if component loaded */}
        {PaymentProofForm && !isLunas && inv.status !== 'paid' && (
          <div className="px-6 pb-6 no-print">
            <PaymentProofForm token={inv.public_token} expectedAmount={sisaInvoice || inv.amount} />
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
                        <a href={p.proof_url} target="_blank" rel="noreferrer" className="block mt-1 text-[10px] underline no-print">Lihat bukti</a>
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
