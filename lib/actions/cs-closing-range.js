'use server';

// Total closingan untuk rentang tanggal bebas (dipakai panel di CS Daily).
// Definisi closing = peserta AKTIF (bukan transfer/refund, bukan lead_source 'master')
// yang joined_at-nya jatuh dalam rentang [from 00:00 WIB, to 23:59 WIB].
import { createClient } from '@/lib/supabase/server';
import { assertStaff } from '@/lib/auth/require-staff';
import { fetchAll } from '@/lib/supabase/fetch-all';

export async function getClosingByRange(from, to) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/cs');
  if (g.error) return { error: g.error };
  if (!from || !to) return { error: 'Tanggal belum lengkap.' };
  if (from > to) { const t = from; from = to; to = t; }

  const sUtc = new Date(from + 'T00:00:00+07:00').toISOString();
  const eUtc = new Date(to + 'T23:59:59+07:00').toISOString();

  const rows = await fetchAll(() => supabase.from('trip_passengers')
    .select('id, joined_at, price_paid, transfer_status, refund_status, lead_source')
    .gte('joined_at', sUtc).lte('joined_at', eUtc));

  const active = (rows || []).filter((p) =>
    p.transfer_status !== 'transferred' &&
    p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund' &&
    p.lead_source !== 'master');

  const count = active.length;
  const value = active.reduce((a, p) => a + (Number(p.price_paid) || 0), 0);
  return { ok: true, count, value, from, to };
}
