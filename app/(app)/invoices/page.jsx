// Round 93: Admin Invoice list page

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

const STATUS_BADGE = {
  draft:     { label: 'Draft',         color: 'bg-slate-100 text-slate-700' },
  sent:      { label: 'Sent',          color: 'bg-amber-100 text-amber-800' },
  paid:      { label: '✅ Paid',       color: 'bg-green-100 text-green-800' },
  overdue:   { label: '⚠ Overdue',     color: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelled',     color: 'bg-slate-100 text-slate-500' },
};

function fmtDate(s) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return s; }
}

export default async function InvoicesPage() {
  const supabase = createClient();
  const { data: invoices } = await supabase
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  const list = invoices || [];
  const stats = {
    total: list.length,
    draft: list.filter((i) => i.status === 'draft').length,
    sent: list.filter((i) => i.status === 'sent').length,
    paid: list.filter((i) => i.status === 'paid').length,
    totalAmount: list.reduce((s, i) => s + Number(i.amount || 0), 0),
    paidAmount: list.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.amount || 0), 0),
  };
  const sisa = stats.totalAmount - stats.paidAmount;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-brand-700">Invoices</h1>
          <p className="mt-1 text-slate-600">Daftar invoice tagihan ke peserta. Generate via Payment Checklist.</p>
        </div>
        <Link
          href="/settings/company"
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg"
        >
          ⚙ Pengaturan Perusahaan
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Invoice" value={stats.total} color="text-brand-700" bg="bg-brand-50" />
        <StatCard label="Total Tagihan" value={fmtRupiah(stats.totalAmount)} color="text-slate-700" bg="bg-slate-50" small />
        <StatCard label="Sudah Dibayar" value={fmtRupiah(stats.paidAmount)} color="text-green-700" bg="bg-green-50" small />
        <StatCard label="Sisa" value={fmtRupiah(sisa)} color="text-amber-700" bg="bg-amber-50" small />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-bold text-brand-700">Daftar Invoice ({list.length})</h2>
        </div>
        {list.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Belum ada invoice. Generate dari Payment Checklist di /finance/payments/[trip].
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <th className="px-3 py-2">Invoice No</th>
                  <th className="px-3 py-2">Peserta</th>
                  <th className="px-3 py-2">Trip</th>
                  <th className="px-3 py-2">Milestone</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Due</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((i) => {
                  const s = STATUS_BADGE[i.status] || STATUS_BADGE.draft;
                  return (
                    <tr key={i.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-xs font-bold text-brand-700">{i.invoice_no}</td>
                      <td className="px-3 py-2 text-xs">{i.customer_name || '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        <Link href={`/trips/${i.trip_id}`} className="text-brand-600 hover:underline">
                          {i.trip_kode || i.trip_id}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs font-semibold">{i.milestone}</td>
                      <td className="px-3 py-2 text-right font-bold">{fmtRupiah(i.amount)}</td>
                      <td className="px-3 py-2 text-xs">{fmtDate(i.due_date)}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${s.color}`}>{s.label}</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link href={`/invoices/${i.id}`} className="text-xs font-semibold text-brand-600 hover:underline">
                          Detail →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color, bg, small = false }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 font-bold ${color} ${small ? 'text-lg' : 'text-2xl'}`}>{value}</p>
    </div>
  );
}
