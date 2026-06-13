'use server';

// Agregasi keuangan per tahun (cash basis) untuk auto-hitung pajak tahunan.
// Sumber (Real Cashflow):
//  - Omzet peserta  = Σ participant_payments.amount  (per tahun paid_at/created_at)
//  - Kas masuk lain = Σ accounting_entries(type='in').amount (per tahun date)
//  - Beban HPP      = Σ trip_finance_items (dp_paid + payoff_amount), per tahun tgl bayar
//  - Beban operasional = Σ accounting_entries(type='out').amount
import { createClient } from '@/lib/supabase/server';

function yr(...vals) {
  for (const v of vals) {
    if (v) { const s = String(v); if (s.length >= 4) return s.slice(0, 4); }
  }
  return null;
}

export async function getYearlyFinancials() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const [pp, ae, fi] = await Promise.all([
    supabase.from('participant_payments').select('amount, paid_at, created_at'),
    supabase.from('accounting_entries').select('amount, type, date, created_at'),
    supabase.from('trip_finance_items').select('item_type, total_amount, payment_status, dp_paid, dp_date, payoff_amount, payoff_date, transfer_date, created_at'),
  ]);

  const Y = {}; // year -> { pesertaIn, manualIn, hppOut, opsOut }
  const ensure = (y) => (Y[y] = Y[y] || { pesertaIn: 0, manualIn: 0, hppOut: 0, opsOut: 0 });

  for (const p of (pp.data || [])) {
    const y = yr(p.paid_at, p.created_at); if (!y) continue;
    ensure(y).pesertaIn += Number(p.amount || 0);
  }
  for (const e of (ae.data || [])) {
    const y = yr(e.date, e.created_at); if (!y) continue;
    const amt = Number(e.amount || 0);
    if (e.type === 'in') ensure(y).manualIn += amt;
    else if (e.type === 'out') ensure(y).opsOut += amt;
  }
  for (const it of (fi.data || [])) {
    if (it.item_type !== 'hpp') continue;
    const dp = Number(it.dp_paid || 0);
    const payoff = Number(it.payoff_amount || 0);
    if (dp > 0) { const y = yr(it.dp_date, it.transfer_date, it.created_at); if (y) ensure(y).hppOut += dp; }
    if (payoff > 0) { const y = yr(it.payoff_date, it.created_at); if (y) ensure(y).hppOut += payoff; }
    if (dp === 0 && payoff === 0 && it.payment_status === 'lunas') {
      const y = yr(it.payoff_date, it.transfer_date, it.created_at);
      if (y) ensure(y).hppOut += Number(it.total_amount || 0);
    }
  }

  const rows = Object.keys(Y).sort((a, b) => b.localeCompare(a)).map((y) => ({
    year: Number(y),
    peserta_in: Math.round(Y[y].pesertaIn),
    manual_in: Math.round(Y[y].manualIn),
    hpp_out: Math.round(Y[y].hppOut),
    ops_out: Math.round(Y[y].opsOut),
  }));

  return { ok: true, rows };
}
