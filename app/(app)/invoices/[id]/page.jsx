// Round 93: Admin Invoice detail — preview + actions (send WA, approve payment, mark paid)

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah } from '@/lib/utils/format';
import InvoiceAdminActions from '@/components/invoice/InvoiceAdminActions';

export const dynamic = 'force-dynamic';

function fmtDate(s) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return s; }
}

const STATUS_BADGE = {
  draft:     { label: 'Draft',         color: 'bg-slate-100 text-slate-700' },
  sent:      { label: 'Sent',          color: 'bg-amber-100 text-amber-800' },
  paid:      { label: '✅ Paid',       color: 'bg-green-100 text-green-800' },
  overdue:   { label: '⚠ Overdue',     color: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelled',     color: 'bg-slate-100 text-slate-500' },
};

export default async function InvoiceDetailAdmin({ params }) {
  const { id } = await params;
  const supabase = createClient();

  const [invRes, paymentsRes] = await Promise.all([
    supabase.from('invoices').select('*').eq('id', id).maybeSingle(),
    supabase.from('invoice_payments').select('*').eq('invoice_id', id).order('created_at', { ascending: false }),
  ]);

  if (invRes.error || !invRes.data) notFound();
  const inv = invRes.data;
  const payments = paymentsRes.data || [];

  const status = STATUS_BADGE[inv.status] || STATUS_BADGE.draft;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  const publicLink = `${baseUrl}/invoice/${inv.public_token}`;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/invoices" className="text-sm text-brand-600 font-medium hover:underline">← Daftar Invoice</Link>
        <div className="mt-2 flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-brand-700 font-mono">{inv.invoice_no}</h1>
            <p className="mt-1 text-slate-600">{inv.description}</p>
          </div>
          <span className={`text-sm font-bold px-3 py-1.5 rounded ${status.color}`}>{status.label}</span>
        </div>
      </div>

      {/* Public link */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="font-bold text-blue-800">🔗 Link Public untuk Peserta:</p>
          <p className="font-mono break-all">{publicLink}</p>
        </div>
        <a href={publicLink} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded">
          Buka Public Page →
        </a>
      </div>

      {/* Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Peserta</p>
          <p className="font-bold text-slate-800">{inv.customer_name || '—'}</p>
          <p className="text-xs text-slate-600">📞 {inv.customer_phone || '—'}</p>
          <p className="text-xs text-slate-600">✉ {inv.customer_email || '—'}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Trip & Tagihan</p>
          <p className="font-bold text-slate-800">{inv.trip_name}</p>
          {inv.trip_kode && <p className="text-xs text-slate-600 font-mono">{inv.trip_kode}</p>}
          <p className="text-xs text-slate-600 mt-1">Milestone: <span className="font-bold">{inv.milestone}</span></p>
          <p className="text-xs text-slate-600">Due: {fmtDate(inv.due_date)}</p>
        </div>
      </div>

      {/* Amount */}
      <div className="bg-gradient-to-r from-brand-50 to-blue-50 rounded-xl border border-brand-200 p-5">
        <p className="text-xs font-bold text-brand-700 uppercase tracking-wider">Total Tagihan</p>
        <p className="text-4xl font-bold text-brand-700">{fmtRupiah(inv.amount)}</p>
      </div>

      {/* Actions */}
      <InvoiceAdminActions invoice={inv} />

      {/* Payment History */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-brand-700">Bukti Pembayaran ({payments.length})</h2>
        </div>
        {payments.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            Belum ada bukti pembayaran dari peserta.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {payments.map((p) => (
              <div key={p.id} className={`p-4 ${
                p.status === 'verified' ? 'bg-green-50/50' :
                p.status === 'rejected' ? 'bg-red-50/50' :
                'bg-amber-50/50'
              }`}>
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-lg">{fmtRupiah(p.amount)}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        p.status === 'verified' ? 'bg-green-200 text-green-800' :
                        p.status === 'rejected' ? 'bg-red-200 text-red-800' :
                        'bg-amber-200 text-amber-800'
                      }`}>
                        {p.status === 'verified' ? '✓ Verified' :
                         p.status === 'rejected' ? '✕ Rejected' : '⏳ Pending'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      {fmtDate(p.payment_date)} · {p.payment_method}
                    </p>
                    {p.note_from_customer && <p className="text-xs italic text-slate-700 mt-1">"{p.note_from_customer}"</p>}
                    {p.reject_reason && <p className="text-xs text-red-700 mt-1">Reason: {p.reject_reason}</p>}
                    {p.verified_by && <p className="text-[10px] text-slate-500 mt-1">Verified by {p.verified_by}</p>}
                  </div>
                  <div className="text-right space-y-2">
                    {p.proof_url && (
                      <a
                        href={p.proof_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block px-3 py-1 bg-slate-100 hover:bg-slate-200 text-xs font-semibold rounded"
                      >
                        📎 Lihat Bukti
                      </a>
                    )}
                  </div>
                </div>
                {p.status === 'pending' && (
                  <InvoiceAdminActions invoice={inv} paymentId={p.id} mode="payment" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
