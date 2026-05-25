// Round 106: Public invoice page + breakdown items + REAL sisa pembayaran
// - Tampilin paket tour breakdown (room type, tips, city tax, opt-in)
// - Sisa pembayaran pakai data REAL dari participant_payments + price_breakdown
//   (bukan cuma sisa dari 1 invoice ini)

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import PaymentProofForm from '@/components/invoice/PaymentProofForm';
import PrintInvoiceButton from '@/components/invoice/PrintInvoiceButton';

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

export default async function PublicInvoicePage({ params }) {
  const { token } = await params;
  const supabase = createClient();

  const [invRes, companyRes] = await Promise.all([
    supabase.from('invoices').select('*').eq('public_token', token).maybeSingle(),
    supabase.from('company_settings').select('*').eq('id', 1).maybeSingle(),
  ]);

  if (invRes.error || !invRes.data) notFound();
  const inv = invRes.data;
  const company = companyRes.data || {};

  // Fetch payments untuk invoice ini (history bayar)
  const { data: payments } = await supabase
    .from('invoice_payments').select('*')
    .eq('invoice_id', inv.id).order('created_at', { ascending: false });

  // Round 106: Fetch trip price_breakdown + payment_template + passenger info
  let breakdown = {};
  let template = {};
  let passenger = null;
  let trip = null;
  let participantPayments = [];

  try {
    if (inv.trip_id) {
      const { data: t } = await supabase.from('trips')
        .select('id, name, kode_trip, price_breakdown, payment_template, destination, departure, arrival')
        .eq('id', inv.trip_id).maybeSingle();
      trip = t;
      breakdown = (t?.price_breakdown && typeof t.price_breakdown === 'object') ? t.price_breakdown : {};
      template = (t?.payment_template && typeof t.payment_template === 'object') ? t.payment_template : {};
    }
    if (inv.passenger_id) {
      const { data: p } = await supabase.from('trip_passengers')
        .select('id, room_type, age_type').eq('id', inv.passenger_id).maybeSingle();
      passenger = p;
      const { data: pays } = await supabase.from('participant_payments')
        .select('type, amount, paid_at').eq('passenger_id', inv.passenger_id);
      participantPayments = pays || [];
    }
  } catch (e) {
    console.error('[invoice public fetch]', e?.message);
  }

  // Round 106: Compute REAL sisa pembayaran (dari breakdown + matrix payments)
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
  if (paidTypes.has('Visa') && visaPrice > 0) {
    expectedTotalReal += visaPrice;
    optItems.push({ label: 'Visa', amount: visaPrice });
  }
  if (paidTypes.has('Asuransi') && asuransiPrice > 0) {
    expectedTotalReal += asuransiPrice;
    optItems.push({ label: 'Asuransi', amount: asuransiPrice });
  }

  const sisaReal = Math.max(expectedTotalReal - totalPaidReal, 0);
  const isLunas = expectedTotalReal > 0 && sisaReal === 0;

  // Round 106: Build paket tour breakdown items
  const tourItems = [];
  if (roomPrice > 0) {
    tourItems.push({
      label: `Paket Tour (${passenger?.room_type || 'Room'})`,
      amount: roomPrice,
      detail: 'Harga paket per pax',
    });
  }
  if (tips > 0) {
    tourItems.push({ label: 'Tips', amount: tips });
  }
  if (cityTax > 0) {
    tourItems.push({ label: 'City Tax', amount: cityTax });
  }
  for (const opt of optItems) {
    tourItems.push({ label: opt.label, amount: opt.amount, detail: 'opt-in' });
  }

  // Sisa untuk THIS invoice (kalau invoice belum lunas)
  const totalPaidThisInvoice = (payments || [])
    .filter((p) => p.status === 'verified')
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const sisaInvoice = Math.max(Number(inv.amount) - totalPaidThisInvoice, 0);

  const status = STATUS_BADGE[inv.status] || STATUS_BADGE.sent;

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

      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden invoice-card">
        {/* Header */}
        <div className="bg-gradient-to-r from-brand-600 to-brand-800 text-white p-6">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              {company.company_logo_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={company.company_logo_url} alt={company.company_name} className="h-12 mb-2 bg-white rounded p-1" />
              )}
              <h1 className="text-2xl font-bold">{company.company_name || 'Traveling Eropa'}</h1>
              {company.company_address && <p className="text-xs mt-1 opacity-90 whitespace-pre-line">{company.company_address}</p>}
              {company.company_phone && <p className="text-xs opacity-90">📞 {company.company_phone}</p>}
              {company.company_email && <p className="text-xs opacity-90">✉ {company.company_email}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs opacity-90">INVOICE</p>
              <p className="text-xl font-bold font-mono">{inv.invoice_no}</p>
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
              <p className="font-bold text-slate-800">{inv.trip_name || inv.trip_id}</p>
              {inv.trip_kode && <p className="text-xs text-slate-600 font-mono">{inv.trip_kode}</p>}
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

        {/* ROUND 106: BREAKDOWN PAKET TOUR (tampil di invoice penagihan) */}
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

        {/* Tagihan Saat Ini (milestone yang lagi ditagih) */}
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
                  <p className="font-semibold text-slate-800">{inv.milestone}</p>
                  <p className="text-xs text-slate-500">{inv.description}</p>
                </td>
                <td className="px-3 py-3 text-right font-bold text-slate-800">{fmtRupiah(inv.amount)}</td>
              </tr>
            </tbody>
            <tfoot className="bg-slate-50">
              <tr>
                <td className="px-3 py-3 text-right font-bold text-slate-700">TOTAL TAGIHAN</td>
                <td className="px-3 py-3 text-right font-bold text-2xl text-brand-700">{fmtRupiah(inv.amount)}</td>
              </tr>
              {totalPaidThisInvoice > 0 && totalPaidThisInvoice < inv.amount && (
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

        {/* Action Buttons */}
        <div className="px-6 pb-4 no-print">
          <div className="flex gap-2 flex-wrap">
            <PrintInvoiceButton invoiceNo={inv.invoice_no} />
          </div>
        </div>

        {/* Payment Proof Form */}
        {!isLunas && inv.status !== 'paid' && (
          <div className="px-6 pb-6 no-print">
            <PaymentProofForm token={inv.public_token} expectedAmount={sisaInvoice || inv.amount} />
          </div>
        )}

        {/* Payment History (this invoice only) */}
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
                      <p className="text-[10px]">{fmtDate(p.payment_date)} · {p.payment_method}</p>
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
