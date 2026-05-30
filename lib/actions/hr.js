'use server';

// Round 170: HR module — employees CRUD + HR dashboard data
// Path: lib/actions/hr.js

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

function revalidateHR(employeeId) {
  revalidatePath('/hr');
  revalidatePath('/hr/employees');
  if (employeeId) revalidatePath(`/hr/employees/${employeeId}`);
  revalidatePath('/hr/payroll');
  revalidatePath('/hr/attendance');
  revalidatePath('/hr/kpi');
}

function parseInt0(v) { const n = parseInt(v); return isNaN(n) ? 0 : n; }
function clean(v) { return (v || '').toString().trim() || null; }

// ============ EMPLOYEES CRUD ============

export async function createEmployee(formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const created_by = user.user_metadata?.full_name || user.email || 'unknown';

  const payload = {
    full_name: clean(formData.get('full_name')),
    nickname: clean(formData.get('nickname')),
    email: clean(formData.get('email')),
    phone: clean(formData.get('phone')),
    whatsapp: clean(formData.get('whatsapp')) || clean(formData.get('phone')),
    ktp_number: clean(formData.get('ktp_number')),
    npwp_number: clean(formData.get('npwp_number')),
    address: clean(formData.get('address')),
    birth_date: formData.get('birth_date') || null,
    gender: clean(formData.get('gender')),
    marital_status: clean(formData.get('marital_status')),
    emergency_contact: clean(formData.get('emergency_contact')),
    employment_type: clean(formData.get('employment_type')) || 'fulltime',
    role: clean(formData.get('role')),
    department: clean(formData.get('department')),
    position: clean(formData.get('position')),
    start_date: formData.get('start_date') || null,
    end_date: formData.get('end_date') || null,
    status: clean(formData.get('status')) || 'active',
    base_salary: parseInt0(formData.get('base_salary')),
    transport_allowance: parseInt0(formData.get('transport_allowance')),
    meal_allowance: parseInt0(formData.get('meal_allowance')),
    bpjs_kesehatan_amount: parseInt0(formData.get('bpjs_kesehatan_amount')),
    bpjs_ketenagakerjaan_amount: parseInt0(formData.get('bpjs_ketenagakerjaan_amount')),
    per_trip_fee: parseInt0(formData.get('per_trip_fee')),
    hourly_rate: parseInt0(formData.get('hourly_rate')),
    bank_name: clean(formData.get('bank_name')),
    bank_account_number: clean(formData.get('bank_account_number')),
    bank_account_holder: clean(formData.get('bank_account_holder')),
    avatar_url: clean(formData.get('avatar_url')),
    notes: clean(formData.get('notes')),
    created_by,
  };

  if (!payload.full_name) return { error: 'Nama lengkap wajib diisi' };

  const { data, error } = await supabase
    .from('employees')
    .insert(payload)
    .select('id')
    .single();

  if (error) return { error: error.message };

  revalidateHR();
  redirect(`/hr/employees/${data.id}`);
}

export async function updateEmployee(id, formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  const payload = {
    full_name: clean(formData.get('full_name')),
    nickname: clean(formData.get('nickname')),
    email: clean(formData.get('email')),
    phone: clean(formData.get('phone')),
    whatsapp: clean(formData.get('whatsapp')),
    ktp_number: clean(formData.get('ktp_number')),
    npwp_number: clean(formData.get('npwp_number')),
    address: clean(formData.get('address')),
    birth_date: formData.get('birth_date') || null,
    gender: clean(formData.get('gender')),
    marital_status: clean(formData.get('marital_status')),
    emergency_contact: clean(formData.get('emergency_contact')),
    employment_type: clean(formData.get('employment_type')),
    role: clean(formData.get('role')),
    department: clean(formData.get('department')),
    position: clean(formData.get('position')),
    start_date: formData.get('start_date') || null,
    end_date: formData.get('end_date') || null,
    status: clean(formData.get('status')),
    base_salary: parseInt0(formData.get('base_salary')),
    transport_allowance: parseInt0(formData.get('transport_allowance')),
    meal_allowance: parseInt0(formData.get('meal_allowance')),
    bpjs_kesehatan_amount: parseInt0(formData.get('bpjs_kesehatan_amount')),
    bpjs_ketenagakerjaan_amount: parseInt0(formData.get('bpjs_ketenagakerjaan_amount')),
    per_trip_fee: parseInt0(formData.get('per_trip_fee')),
    hourly_rate: parseInt0(formData.get('hourly_rate')),
    bank_name: clean(formData.get('bank_name')),
    bank_account_number: clean(formData.get('bank_account_number')),
    bank_account_holder: clean(formData.get('bank_account_holder')),
    avatar_url: clean(formData.get('avatar_url')),
    notes: clean(formData.get('notes')),
  };

  const { error } = await supabase
    .from('employees')
    .update(payload)
    .eq('id', id);

  if (error) return { error: error.message };

  revalidateHR(id);
  return { ok: true };
}

export async function deleteEmployee(id) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const { error } = await supabase.from('employees').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidateHR();
  return { ok: true };
}

// Toggle status active/inactive (soft delete)
export async function toggleEmployeeStatus(id, newStatus) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const { error } = await supabase
    .from('employees')
    .update({ status: newStatus || 'inactive' })
    .eq('id', id);

  if (error) return { error: error.message };
  revalidateHR(id);
  return { ok: true };
}

// ============ HR DASHBOARD DATA ============

export async function getHRDashboardData() {
  const supabase = getServiceClient() || createClient();

  const [empRes, attRes, leaveRes] = await Promise.all([
    supabase.from('employees').select('id, status, employment_type, role, department'),
    supabase.from('attendance').select('id, employee_id, status, date').gte('date', new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0, 10)),
    supabase.from('leave_requests').select('id, status').eq('status', 'pending'),
  ]);

  const employees = empRes.data || [];
  const attendance = attRes.data || [];
  const pendingLeaves = leaveRes.data || [];

  const stats = {
    total_employees: employees.length,
    active_employees: employees.filter((e) => e.status === 'active').length,
    by_type: {},
    by_role: {},
    by_department: {},
    pending_leaves: pendingLeaves.length,
    attendance_last_30d: attendance.length,
  };

  for (const e of employees) {
    if (e.employment_type) stats.by_type[e.employment_type] = (stats.by_type[e.employment_type] || 0) + 1;
    if (e.role) stats.by_role[e.role] = (stats.by_role[e.role] || 0) + 1;
    if (e.department) stats.by_department[e.department] = (stats.by_department[e.department] || 0) + 1;
  }

  return stats;
}
