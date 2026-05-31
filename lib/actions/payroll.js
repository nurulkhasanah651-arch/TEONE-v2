'use server';

// Round 176: Payroll — TL DIKELUARKAN dari generatePayroll
// (TL flow pindah ke /hr/tl-payments dengan split 70%/30%)
// Path: lib/actions/payroll.js

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const MONTH_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function revalidateHRPayroll(periodId) {
  revalidatePath('/hr');
  revalidatePath('/hr/payroll');
  if (periodId) revalidatePath(`/hr/payroll/${periodId}`);
  revalidatePath('/accounting');
}

// ============ AUTO-LINK ============
export async function syncEmployeesWithAuth() {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role not configured' };

  const { data: employees } = await supabase
    .from('employees')
    .select('id, full_name, email, user_id')
    .is('user_id', null)
    .not('email', 'is', null);

  if (!employees || employees.length === 0) {
    return { ok: true, linked: 0, message: 'Semua karyawan sudah ter-link / belum ada karyawan dengan email' };
  }

  const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
  if (!authUsers) return { error: 'Gagal fetch auth users' };

  const emailToUserId = {};
  for (const u of authUsers) {
    if (u.email) emailToUserId[u.email.toLowerCase()] = u.id;
  }

  let linkedCount = 0;
  const linkedEmployees = [];
  for (const emp of employees) {
    const matchedUserId = emailToUserId[emp.email.toLowerCase()];
    if (matchedUserId) {
      const { error } = await supabase
        .from('employees')
        .update({ user_id: matchedUserId })
        .eq('id', emp.id);
      if (!error) {
        linkedCount++;
        linkedEmployees.push(emp.full_name);
      }
    }
  }

  revalidatePath('/hr');
  revalidatePath('/hr/employees');
  return {
    ok: true,
    linked: linkedCount,
    total_unlinked: employees.length,
    linked_names: linkedEmployees,
    message: `${linkedCount}/${employees.length} karyawan berhasil di-link ke akun TEONE.`,
  };
}

// ============ R176: GENERATE PAYROLL — SKIP TL ============
export async function generatePayroll(formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const year = parseInt(formData.get('year')) || new Date().getFullYear();
  const month = parseInt(formData.get('month')) || new Date().getMonth() + 1;
  const notes = (formData.get('notes') || '').trim() || null;

  const { data: existing } = await supabase
    .from('payroll_periods')
    .select('id, status')
    .eq('period_year', year)
    .eq('period_month', month)
    .maybeSingle();

  if (existing) {
    return { error: `Payroll periode ${MONTH_NAMES[month-1]} ${year} sudah ada (ID: ${existing.id}). Hapus dulu kalau mau re-generate.` };
  }

  // R176: SKIP tour_leader — TL pakai modul terpisah /hr/tl-payments
  const { data: employees } = await supabase
    .from('employees')
    .select('*')
    .eq('status', 'active')
    .neq('employment_type', 'tour_leader');

  if (!employees || employees.length === 0) {
    return { error: 'Belum ada karyawan internal active. Tambah dulu di /hr/employees (TL pakai /hr/tl-payments).' };
  }

  const { data: period, error: pErr } = await supabase
    .from('payroll_periods')
    .insert({
      period_year: year,
      period_month: month,
      period_label: `${MONTH_NAMES[month-1]} ${year}`,
      status: 'draft',
      total_employees: employees.length,
      notes,
    })
    .select('id')
    .single();

  if (pErr) return { error: 'Gagal bikin periode: ' + pErr.message };

  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;

  for (const emp of employees) {
    // R176: Cuma proses non-TL — monthly entry untuk fulltime/parttime/contract/freelance
    let baseSalary = 0;
    let transport = 0;
    let meal = 0;

    if (['fulltime', 'parttime', 'contract'].includes(emp.employment_type)) {
      baseSalary = emp.base_salary || 0;
      transport = emp.transport_allowance || 0;
      meal = emp.meal_allowance || 0;
    }

    const grossTotal = baseSalary + transport + meal;
    const bpjsK = emp.bpjs_kesehatan_amount || 0;
    const bpjsTK = emp.bpjs_ketenagakerjaan_amount || 0;
    const totalDeduct = bpjsK + bpjsTK;
    const netPay = grossTotal - totalDeduct;

    await supabase.from('payroll_entries').insert({
      period_id: period.id,
      employee_id: emp.id,
      entry_type: 'monthly',
      base_salary: baseSalary,
      transport_allowance: transport,
      meal_allowance: meal,
      gross_total: grossTotal,
      bpjs_kesehatan: bpjsK,
      bpjs_ketenagakerjaan: bpjsTK,
      total_deductions: totalDeduct,
      net_pay: netPay,
      status: 'draft',
    });

    totalGross += grossTotal;
    totalDeductions += totalDeduct;
    totalNet += netPay;
  }

  await supabase
    .from('payroll_periods')
    .update({
      total_gross: totalGross,
      total_deductions: totalDeductions,
      total_net: totalNet,
    })
    .eq('id', period.id);

  revalidateHRPayroll(period.id);
  redirect(`/hr/payroll/${period.id}`);
}

// ============ UPDATE PAYROLL ENTRY (manual adjust) ============
export async function updatePayrollEntry(entryId, formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  const fields = {
    base_salary: parseInt(formData.get('base_salary')) || 0,
    transport_allowance: parseInt(formData.get('transport_allowance')) || 0,
    meal_allowance: parseInt(formData.get('meal_allowance')) || 0,
    bonus: parseInt(formData.get('bonus')) || 0,
    overtime: parseInt(formData.get('overtime')) || 0,
    per_trip_earnings: parseInt(formData.get('per_trip_earnings')) || 0,
    trip_count: parseInt(formData.get('trip_count')) || 0,
    freelance_earnings: parseInt(formData.get('freelance_earnings')) || 0,
    other_earnings: parseInt(formData.get('other_earnings')) || 0,
    pph21: parseInt(formData.get('pph21')) || 0,
    bpjs_kesehatan: parseInt(formData.get('bpjs_kesehatan')) || 0,
    bpjs_ketenagakerjaan: parseInt(formData.get('bpjs_ketenagakerjaan')) || 0,
    kasbon: parseInt(formData.get('kasbon')) || 0,
    late_penalty: parseInt(formData.get('late_penalty')) || 0,
    other_deductions: parseInt(formData.get('other_deductions')) || 0,
    notes: (formData.get('notes') || '').trim() || null,
  };

  fields.gross_total = fields.base_salary + fields.transport_allowance + fields.meal_allowance
    + fields.bonus + fields.overtime + fields.per_trip_earnings + fields.freelance_earnings + fields.other_earnings;
  fields.total_deductions = fields.pph21 + fields.bpjs_kesehatan + fields.bpjs_ketenagakerjaan
    + fields.kasbon + fields.late_penalty + fields.other_deductions;
  fields.net_pay = fields.gross_total - fields.total_deductions;

  const { data: entry, error } = await supabase
    .from('payroll_entries')
    .update(fields)
    .eq('id', entryId)
    .select('period_id')
    .single();

  if (error) return { error: error.message };

  await recomputePeriodTotals(supabase, entry.period_id);
  revalidateHRPayroll(entry.period_id);
  return { ok: true };
}

async function recomputePeriodTotals(supabase, periodId) {
  const { data: entries } = await supabase
    .from('payroll_entries')
    .select('gross_total, total_deductions, net_pay, employee_id')
    .eq('period_id', periodId);

  if (!entries) return;
  const tg = entries.reduce((s, e) => s + (e.gross_total || 0), 0);
  const td = entries.reduce((s, e) => s + (e.total_deductions || 0), 0);
  const tn = entries.reduce((s, e) => s + (e.net_pay || 0), 0);
  const uniqueEmps = new Set(entries.map((e) => e.employee_id));

  await supabase
    .from('payroll_periods')
    .update({
      total_gross: tg,
      total_deductions: td,
      total_net: tn,
      total_employees: uniqueEmps.size,
    })
    .eq('id', periodId);
}

// ============ UPLOAD PAYMENT PROOF (R174) ============
export async function uploadPaymentProof(entryId, formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const file = formData.get('file');
  if (!file || typeof file === 'string') return { error: 'No file uploaded' };

  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) return { error: `File terlalu besar (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 10MB.` };

  const supabase = getServiceClient() || authClient;
  const fileExt = file.name.split('.').pop().toLowerCase();
  const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
  if (!allowedExts.includes(fileExt)) return { error: 'Format harus JPG/PNG/WebP/PDF' };

  const timestamp = Date.now();
  const filename = `entry-${entryId}-${timestamp}.${fileExt}`;
  const path = `${user.id}/${filename}`;

  const { data, error } = await supabase.storage
    .from('payroll-proofs')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });

  if (error) return { error: 'Upload gagal: ' + error.message };

  const { data: pub } = supabase.storage.from('payroll-proofs').getPublicUrl(data.path);

  const { data: entry, error: updErr } = await supabase
    .from('payroll_entries')
    .update({
      payment_proof_url: pub.publicUrl,
      status: 'paid',
      paid_at: new Date().toISOString(),
      payment_method: 'bank_transfer',
    })
    .eq('id', entryId)
    .select('period_id')
    .single();

  if (updErr) return { error: updErr.message };

  revalidateHRPayroll(entry.period_id);
  return { ok: true, url: pub.publicUrl };
}

// ============ GET SIGNED URL ============
export async function getPaymentProofSignedUrl(entryId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const { data: entry } = await supabase
    .from('payroll_entries')
    .select('payment_proof_url')
    .eq('id', entryId)
    .maybeSingle();

  if (!entry?.payment_proof_url) return { error: 'No payment proof' };

  const m = entry.payment_proof_url.match(/\/storage\/v1\/object\/(?:public|sign)\/payroll-proofs\/(.+?)(?:\?|$)/);
  if (!m) return { url: entry.payment_proof_url };

  const path = m[1];
  const { data, error } = await supabase.storage
    .from('payroll-proofs')
    .createSignedUrl(path, 300);

  if (error) return { error: error.message };
  return { url: data.signedUrl };
}

// ============ MARK PAID (tanpa upload) ============
export async function markEntryAsPaid(entryId, paymentMethod = 'bank_transfer') {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const { data: entry, error } = await supabase
    .from('payroll_entries')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      payment_method: paymentMethod,
    })
    .eq('id', entryId)
    .select('period_id')
    .single();

  if (error) return { error: error.message };
  revalidateHRPayroll(entry.period_id);
  return { ok: true };
}

// ============ FINALIZE / MARK ALL PAID / DELETE ============
export async function finalizePeriod(periodId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const { error } = await supabase
    .from('payroll_periods')
    .update({
      status: 'finalized',
      finalized_at: new Date().toISOString(),
      finalized_by: user.user_metadata?.full_name || user.email,
    })
    .eq('id', periodId);

  if (error) return { error: error.message };
  revalidateHRPayroll(periodId);
  return { ok: true };
}

export async function markAllEntriesPaid(periodId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  await supabase
    .from('payroll_entries')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      payment_method: 'bank_transfer',
    })
    .eq('period_id', periodId);

  await supabase
    .from('payroll_periods')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
    })
    .eq('id', periodId);

  revalidateHRPayroll(periodId);
  return { ok: true };
}

export async function deletePeriod(periodId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const { error } = await supabase
    .from('payroll_periods')
    .delete()
    .eq('id', periodId);

  if (error) return { error: error.message };
  revalidatePath('/hr/payroll');
  return { ok: true };
}

// ============ DELETE PAYMENT PROOF ============
export async function deletePaymentProof(entryId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  const { data: entry } = await supabase
    .from('payroll_entries')
    .select('payment_proof_url, period_id')
    .eq('id', entryId)
    .maybeSingle();

  if (entry?.payment_proof_url) {
    const m = entry.payment_proof_url.match(/\/storage\/v1\/object\/(?:public|sign)\/payroll-proofs\/(.+?)(?:\?|$)/);
    if (m) {
      try {
        await supabase.storage.from('payroll-proofs').remove([m[1]]);
      } catch {}
    }
  }

  await supabase
    .from('payroll_entries')
    .update({ payment_proof_url: null })
    .eq('id', entryId);

  revalidateHRPayroll(entry?.period_id);
  return { ok: true };
}
