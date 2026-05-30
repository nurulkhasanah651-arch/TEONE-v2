'use server';

// Round 171: Payroll module — generate, payslip, mark paid + auto-link email
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

// ============ AUTO-LINK EMPLOYEES TO AUTH.USERS by email ============
export async function syncEmployeesWithAuth() {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role not configured' };

  // Get all employees without user_id
  const { data: employees } = await supabase
    .from('employees')
    .select('id, full_name, email, user_id')
    .is('user_id', null)
    .not('email', 'is', null);

  if (!employees || employees.length === 0) {
    return { ok: true, linked: 0, message: 'Semua karyawan sudah ter-link / belum ada karyawan dengan email' };
  }

  // Get all auth users
  const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
  if (!authUsers) return { error: 'Gagal fetch auth users' };

  // Map email → user_id
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

// ============ COUNT TL TRIPS for per-trip earnings ============
async function countTLTripsInPeriod(supabase, employeeId, year, month) {
  // Get employee's full name to match with trip tl_name
  const { data: emp } = await supabase
    .from('employees')
    .select('id, full_name, nickname')
    .eq('id', employeeId)
    .maybeSingle();

  if (!emp) return 0;

  // Date range: bulan target
  const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const toDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // Trip yang departure-nya di bulan target dan tl_name match
  // (Asumsi: trip dianggap "selesai dikerjakan TL" di bulan keberangkatan)
  const { data: trips } = await supabase
    .from('trips')
    .select('id, name, departure, tl_name, tl_id, tl_assignment_status')
    .gte('departure', fromDate)
    .lte('departure', toDate)
    .in('status', ['departed', 'closed', 'completed', 'finished']);

  if (!trips) return 0;

  // Match by name or tl_id
  const matches = trips.filter((t) => {
    if (t.tl_id && String(t.tl_id) === String(employeeId)) return true;
    const tlName = (t.tl_name || '').toLowerCase().trim();
    const empName = (emp.full_name || '').toLowerCase().trim();
    const empNick = (emp.nickname || '').toLowerCase().trim();
    if (tlName && empName && tlName.includes(empName)) return true;
    if (tlName && empNick && tlName.includes(empNick)) return true;
    return false;
  });

  return matches.length;
}

// ============ GENERATE PAYROLL ============
export async function generatePayroll(formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const year = parseInt(formData.get('year')) || new Date().getFullYear();
  const month = parseInt(formData.get('month')) || new Date().getMonth() + 1;
  const notes = (formData.get('notes') || '').trim() || null;

  // Cek apakah periode udah ada
  const { data: existing } = await supabase
    .from('payroll_periods')
    .select('id, status')
    .eq('period_year', year)
    .eq('period_month', month)
    .maybeSingle();

  if (existing) {
    return { error: `Payroll periode ${MONTH_NAMES[month-1]} ${year} sudah ada (ID: ${existing.id}). Hapus dulu kalau mau re-generate.` };
  }

  // Get all active employees
  const { data: employees } = await supabase
    .from('employees')
    .select('*')
    .eq('status', 'active');

  if (!employees || employees.length === 0) {
    return { error: 'Belum ada karyawan active. Tambah karyawan dulu di /hr/employees.' };
  }

  // Create period
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

  // Generate entries per employee
  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;

  for (const emp of employees) {
    let baseSalary = 0;
    let transport = 0;
    let meal = 0;
    let perTripEarnings = 0;
    let tripCount = 0;
    let freelanceEarnings = 0;

    if (emp.employment_type === 'fulltime' || emp.employment_type === 'parttime' || emp.employment_type === 'contract') {
      baseSalary = emp.base_salary || 0;
      transport = emp.transport_allowance || 0;
      meal = emp.meal_allowance || 0;
    } else if (emp.employment_type === 'tour_leader') {
      tripCount = await countTLTripsInPeriod(supabase, emp.id, year, month);
      perTripEarnings = (emp.per_trip_fee || 0) * tripCount;
    }
    // Freelance hourly — manual input (set di edit payroll entry)

    const grossTotal = baseSalary + transport + meal + perTripEarnings + freelanceEarnings;
    const bpjsK = emp.bpjs_kesehatan_amount || 0;
    const bpjsTK = emp.bpjs_ketenagakerjaan_amount || 0;
    const totalDeduct = bpjsK + bpjsTK;
    const netPay = grossTotal - totalDeduct;

    await supabase.from('payroll_entries').insert({
      period_id: period.id,
      employee_id: emp.id,
      base_salary: baseSalary,
      transport_allowance: transport,
      meal_allowance: meal,
      per_trip_earnings: perTripEarnings,
      trip_count: tripCount,
      freelance_earnings: freelanceEarnings,
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

  // Update period totals
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

// ============ UPDATE PAYROLL ENTRY (manual adjust bonus, kasbon, dll) ============
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

  // Auto-calc gross, total_deductions, net_pay
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

  // Recompute period totals
  await recomputePeriodTotals(supabase, entry.period_id);

  revalidateHRPayroll(entry.period_id);
  return { ok: true };
}

async function recomputePeriodTotals(supabase, periodId) {
  const { data: entries } = await supabase
    .from('payroll_entries')
    .select('gross_total, total_deductions, net_pay')
    .eq('period_id', periodId);

  if (!entries) return;
  const tg = entries.reduce((s, e) => s + (e.gross_total || 0), 0);
  const td = entries.reduce((s, e) => s + (e.total_deductions || 0), 0);
  const tn = entries.reduce((s, e) => s + (e.net_pay || 0), 0);

  await supabase
    .from('payroll_periods')
    .update({
      total_gross: tg,
      total_deductions: td,
      total_net: tn,
      total_employees: entries.length,
    })
    .eq('id', periodId);
}

// ============ MARK ENTRY AS PAID ============
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

// ============ FINALIZE PERIOD (lock dari edit) ============
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

// ============ MARK ALL ENTRIES PAID ============
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

// ============ DELETE PERIOD (+ all entries cascade) ============
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
