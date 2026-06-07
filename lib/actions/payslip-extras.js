'use server';

// Round 176: Payslip extras — send slip ke WA karyawan internal
// Path: lib/actions/payslip-extras.js

import { revalidatePath } from 'next/cache';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sendFonnte, normalizePhone } from '@/lib/utils/fonnte';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function fmtIDR(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
function fmtDateID(d) {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Send payslip (karyawan internal) ke WA — pakai FONNTE_TOKEN_FINANCE
 */
export async function sendInternalPayslipToWA(entryId, options = {}) {
  const supabase = getServiceClient() || createClient();

  try {
    const { data: entry, error } = await supabase
      .from('payroll_entries')
      .select('*, employee:employees(*), period:payroll_periods(*)')
      .eq('id', entryId)
      .maybeSingle();

    if (error) return { error: error.message };
    if (!entry) return { error: 'Slip gak ditemukan' };

    const emp = entry.employee || {};
    const period = entry.period || {};
    const phone = options.targetPhone || emp.whatsapp || emp.phone;

    if (!phone) return { error: `Karyawan "${emp.full_name}" belum punya nomor HP/WA` };

    const isPaid = entry.status === 'paid';
    const totalGross =
      Number(entry.base_salary || 0) +
      Number(entry.transport_allowance || 0) +
      Number(entry.meal_allowance || 0) +
      Number(entry.bonus || 0) +
      Number(entry.overtime || 0);
    const totalDeduction =
      Number(entry.bpjs_kesehatan_amount || 0) +
      Number(entry.bpjs_ketenagakerjaan_amount || 0) +
      Number(entry.tax || 0) +
      Number(entry.other_deduction || 0);
    const takeHome = entry.net_pay || totalGross - totalDeduction;

    const message = [
      `🌟 *SLIP GAJI KARYAWAN* 🌟`,
      ``,
      `Hai *${emp.full_name || 'Karyawan'}*,`,
      `Berikut slip gaji periode *${period.period_label || ''}*:`,
      ``,
      `📌 *Jabatan:* ${emp.position || emp.role || '-'}`,
      `📅 *Periode:* ${period.period_label || '-'}`,
      ``,
      `*PENDAPATAN:*`,
      `• Gaji Pokok      : ${fmtIDR(entry.base_salary)}`,
      Number(entry.transport_allowance) > 0 ? `• Transport       : ${fmtIDR(entry.transport_allowance)}` : null,
      Number(entry.meal_allowance) > 0 ? `• Uang Makan      : ${fmtIDR(entry.meal_allowance)}` : null,
      Number(entry.bonus) > 0 ? `• Bonus           : ${fmtIDR(entry.bonus)}` : null,
      Number(entry.overtime) > 0 ? `• Lembur          : ${fmtIDR(entry.overtime)}` : null,
      `*Total Gross:* ${fmtIDR(totalGross)}`,
      ``,
      totalDeduction > 0 ? `*POTONGAN:*` : null,
      Number(entry.bpjs_kesehatan_amount) > 0 ? `• BPJS Kesehatan  : ${fmtIDR(entry.bpjs_kesehatan_amount)}` : null,
      Number(entry.bpjs_ketenagakerjaan_amount) > 0 ? `• BPJS Ketenagakerjaan: ${fmtIDR(entry.bpjs_ketenagakerjaan_amount)}` : null,
      Number(entry.tax) > 0 ? `• Pajak (PPh)     : ${fmtIDR(entry.tax)}` : null,
      Number(entry.other_deduction) > 0 ? `• Potongan Lain   : ${fmtIDR(entry.other_deduction)}` : null,
      totalDeduction > 0 ? `*Total Potongan:* ${fmtIDR(totalDeduction)}` : null,
      ``,
      `💰 *TAKE HOME PAY: ${fmtIDR(takeHome)}*`,
      ``,
      isPaid
        ? `✅ Status: SUDAH DIBAYAR (${fmtDateID(entry.paid_at)})`
        : `⏳ Status: PENDING`,
      ``,
      emp.bank_name ? `🏦 *Transfer ke:*\n${emp.bank_name} - ${emp.bank_account_number}\na.n. ${emp.bank_account_holder}` : null,
      ``,
      `Terima kasih atas kerja kerasnya! 🙏`,
      `_TEONE — Traveling Eropa_`,
    ].filter((x) => x !== null).join('\n');

    const result = await sendFonnte(phone, message, { context: 'finance' });

    if (result.error) return { error: result.error, sentVia: result.sentVia };

    // Track WA send (kalau column udah ada, kalau gak — skip silent)
    try {
      await supabase
        .from('payroll_entries')
        .update({
          wa_sent_at: new Date().toISOString(),
          wa_sent_to: normalizePhone(phone),
        })
        .eq('id', entryId);
    } catch {}

    revalidatePath(`/hr/payroll/${entry.period_id}/entry/${entryId}`);
    revalidatePath(`/hr/payroll/${entry.period_id}`);
    return { ok: true, sentVia: result.sentVia, target: normalizePhone(phone) };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}
