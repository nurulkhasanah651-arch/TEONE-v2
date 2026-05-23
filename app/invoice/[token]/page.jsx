// Round 93: PUBLIC invoice page — peserta akses via WA link, no login

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import PaymentProofForm from '@/components/invoice/PaymentProofForm';

export const dynamic = 'force-dynamic';

function fmtRupiah(n) {
  return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
}
function fmtDate(s) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return s; }
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

  // Fetch existing payments
  const { data: payments } = await supabase
    .from('invoice_payments')
    .select('*')
    .eq('invoice_id', inv.id)
    .order('created_at', { ascending: false });

  const totalPaid = (payments || [])
    .filter((p) => p.status === 'verified')
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const sisa = Math.max(Number(inv.amount) - totalPaid, 0);
  const status = STATUS_BADGE[inv.status] || STATUS_BADGE.sent;

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
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
              {inv.due_date && <p className="text-xs text-slate-600 mt-1">Due: <span className="font-bold">{fmtDate(inv.due_date)}</span></p>}
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="p-6">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="px-3 py-2">Deskripsi</th>
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
                <td className="px-3 py-3 text-right font-bold text-slate-700">TOTAL</td>
                <td className="px-3 py-3 text-right font-bold text-2xl text-brand-700">{fmtRupiah(inv.amount)}</td>
              </tr>
              {totalPaid > 0 && (
                <>
                  <tr>
                    <td className="px-3 py-1 text-right text-sm text-green-700">Sudah Dibayar</td>
                    <td className="px-3 py-1 text-right text-sm font-bold text-green-700">{fmtRupiah(totalPaid)}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-1 text-right text-sm font-bold text-slate-700">Sisa</td>
                    <td className="px-3 py-1 text-right text-sm font-bold text-amber-700">{fmtRupiah(sisa)}</td>
                  </tr>
                </>
              )}
            </tfoot>
          </table>
        </div>

        {/* Bank Info */}
        {inv.status !== 'paid' && (company.bank_account_no || company.bank_name) && (
          <div className="px-6 pb-4">
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

        {/* Payment Proof Form */}
        {inv.status !== 'paid' && (
          <div className="px-6 pb-6">
            <PaymentProofForm token={inv.public_token} expectedAmount={sisa || inv.amount} />
          </div>
        )}

        {/* Payment History */}
        {payments && payments.length > 0 && (
          <div className="px-6 pb-6">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Riwayat Pembayaran</p>
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
                        <a href={p.proof_url} target="_blank" rel="noreferrer" className="block mt-1 text-[10px] underline">Lihat bukti</a>
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
