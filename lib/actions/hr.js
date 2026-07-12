'use server';

// Round 175: HR actions — + sync TL ke tour_leaders table (backward compat) + tl_subtype
// Path: lib/actions/hr.js

import { revalidatePath } from 'next/cache';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
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
  revalidatePath('/tl-master');  // R175: refresh master TL
}

function parseInt0(v) { const n = parseInt(v); return isNaN(n) ? 0 : n; }
function clean(v) { return (v || '').toString().trim() || null; }

// R175: Sync TL to legacy tour_leaders table for backward compat
async function syncTourLeaderTable(supabase, employee) {
  const normPhone = (p) => String(p || '').replace(/\D/g, '').replace(/^0/, '62');

  // Bukan TL (lagi) → nonaktifkan mirror tour_leaders bila ada, lalu keluar.
  if (employee.employment_type !== 'tour_leader') {
    if (employee.legacy_tl_id) {
      try { await supabase.from('tour_leaders').update({ active: false }).eq('id', employee.legacy_tl_id); } catch {}
    }
    return;
  }

  const patch = {
    name: employee.full_name,
    email: employee.email,
    phone: employee.phone,
    type: employee.tl_subtype || 'inhouse',
    active: employee.status === 'active',
  };

  try {
    // Cari record tour_leaders yg sudah ada: legacy_tl_id → HP → email → nama (hindari duplikat)
    let existingId = employee.legacy_tl_id || null;
    if (!existingId) {
      const { data: all } = await supabase.from('tour_leaders').select('id, name, email, phone');
      const ph = normPhone(employee.phone);
      const em = String(employee.email || '').toLowerCase();
      const nm = String(employee.full_name || '').toLowerCase().trim();
      // JANGAN cocokkan berdasarkan NOMOR HP saja — nomor bisa kebetulan sama antar orang
      // dan bikin data ketimpa (bug lama). Cocokkan hanya via email atau nama persis.
      const hit = (all || []).find((r) =>
        (em && String(r.email || '').toLowerCase() === em) ||
        (nm && String(r.name || '').toLowerCase().trim() === nm)
      );
      existingId = hit?.id || null;
    }

    if (existingId) {
      await supabase.from('tour_leaders').update(patch).eq('id', existingId);
      if (!employee.legacy_tl_id) {
        try { await supabase.from('employees').update({ legacy_tl_id: existingId }).eq('id', employee.id); } catch {}
      }
    } else {
      const { data: tl } = await supabase
        .from('tour_leaders')
        .insert({ ...patch, created_by: 'sync_hr' })
        .select('id')
        .single();
      if (tl) {
        try { await supabase.from('employees').update({ legacy_tl_id: tl.id }).eq('id', employee.id); } catch {}
      }
    }
  } catch (e) {
    // Silent fail — tour_leaders table mungkin udah di-drop atau gak ada
    console.error('[sync tour_leaders]', e?.message);
  }
}

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
    fonnte_token: clean(formData.get('fonnte_token')),
    waba_api_key: clean(formData.get('waba_api_key')),
    waba_phone_id: clean(formData.get('waba_phone_id')),
    notes: clean(formData.get('notes')),
    // R175: TL subtype
    tl_subtype: clean(formData.get('tl_subtype')),
    created_by,
  };

  if (!payload.full_name) return { error: 'Nama lengkap wajib diisi' };

  try {
    const { data, error } = await supabase
      .from('employees')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      if (/relation.*does not exist|table.*not found/i.test(error.message)) {
        return { error: '⚠ Table "employees" belum ada. Run SQL_FIX_hr_tables.txt dari R170.' };
      }
      // Kalau tl_subtype atau legacy_tl_id belum di-add, strip & retry
      if (/tl_subtype|legacy_tl_id/.test(error.message)) {
        const stripped = { ...payload };
        delete stripped.tl_subtype;
        delete stripped.legacy_tl_id;
        const retry = await supabase
          .from('employees')
          .insert(stripped)
          .select('*')
          .single();
        if (retry.error) return { error: retry.error.message };
        revalidateHR();
        redirect(`/hr/employees/${retry.data.id}`);
      }
      return { error: error.message };
    }

    // R175: Sync ke tour_leaders kalau TL
    await syncTourLeaderTable(supabase, data);
    await syncWaNumber(supabase, data);

    revalidateHR();
    redirect(`/hr/employees/${data.id}`);
  } catch (e) {
    if (e?.digest) throw e;
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// Daftarkan/lepas nomor WABA Meta milik PIC ke wa_numbers (Khasanah). Dipanggil
// setelah simpan karyawan supaya finance-send & inbox tahu nomor milik PIC.
async function syncWaNumber(supabase, emp) {
  try {
    if (currentBrandCode() !== 'khasanah' || !emp?.id) return;
    const pid = emp.waba_phone_id ? String(emp.waba_phone_id).trim() : '';
    if (!pid) {
      // nomor dikosongkan -> nonaktifkan mapping lama milik karyawan ini
      try { await supabase.from('wa_numbers').update({ active: false }).eq('pic_employee_id', emp.id); } catch {}
      return;
    }
    const { data: existing } = await supabase.from('wa_numbers').select('id').eq('phone_number_id', pid).maybeSingle();
    if (existing) {
      await supabase.from('wa_numbers').update({ pic_employee_id: emp.id, pic_name: emp.full_name || null, active: true }).eq('id', existing.id);
    } else {
      await supabase.from('wa_numbers').insert({ brand: 'khasanah', phone_number_id: pid, pic_employee_id: emp.id, pic_name: emp.full_name || null, active: true });
    }
  } catch (e) { console.error('[syncWaNumber]', e?.message); }
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
    fonnte_token: clean(formData.get('fonnte_token')),
    waba_api_key: clean(formData.get('waba_api_key')),
    waba_phone_id: clean(formData.get('waba_phone_id')),
    notes: clean(formData.get('notes')),
    tl_subtype: clean(formData.get('tl_subtype')),
  };

  if (payload.role == null || payload.role === '') delete payload.role; // jangan timpa role jadi kosong saat edit
  try {
    let { error } = await supabase
      .from('employees')
      .update(payload)
      .eq('id', id);

    if (error && /tl_subtype/.test(error.message)) {
      const stripped = { ...payload };
      delete stripped.tl_subtype;
      const retry = await supabase.from('employees').update(stripped).eq('id', id);
      error = retry.error;
    }

    if (error) return { error: error.message };

    // R175: Sync ke tour_leaders
    const { data: updated } = await supabase.from('employees').select('*').eq('id', id).maybeSingle();
    if (updated) await syncTourLeaderTable(supabase, updated);
    if (updated) await syncWaNumber(supabase, updated);

    revalidateHR(id);
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

export async function deleteEmployee(id) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  try {
    // R175: Hapus dari tour_leaders juga kalau TL
    const { data: emp } = await supabase
      .from('employees')
      .select('legacy_tl_id, employment_type')
      .eq('id', id)
      .maybeSingle();

    if (emp?.legacy_tl_id) {
      try {
        await supabase.from('tour_leaders').delete().eq('id', emp.legacy_tl_id);
      } catch {}
    }

    const { error } = await supabase.from('employees').delete().eq('id', id);
    if (error) return { error: error.message };
    revalidateHR();
    return { ok: true };
  } catch (e) {
    return { error: e?.message || 'unknown' };
  }
}

export async function toggleEmployeeStatus(id, newStatus) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  try {
    const { error } = await supabase
      .from('employees')
      .update({ status: newStatus || 'inactive' })
      .eq('id', id);
    if (error) return { error: error.message };

    // Sync to tour_leaders
    const { data: updated } = await supabase.from('employees').select('*').eq('id', id).maybeSingle();
    if (updated) await syncTourLeaderTable(supabase, updated);

    revalidateHR(id);
    return { ok: true };
  } catch (e) {
    return { error: e?.message || 'unknown' };
  }
}

// ============ HR DASHBOARD DATA ============

export async function getHRDashboardData() {
  const emptyStats = {
    total_employees: 0,
    active_employees: 0,
    by_type: {},
    by_role: {},
    by_department: {},
    pending_leaves: 0,
    attendance_last_30d: 0,
    setup_needed: false,
    setup_error: null,
  };

  try {
    const supabase = getServiceClient() || createClient();
    const empRes = await supabase
      .from('employees')
      .select('id, status, employment_type, role, department');

    if (empRes.error && /relation.*does not exist|table.*not found/i.test(empRes.error.message)) {
      return {
        ...emptyStats,
        setup_needed: true,
        setup_error: 'Table HR belum dibuat. Run SQL_FIX_hr_tables.txt di Supabase.',
      };
    }

    const employees = empRes.data || [];

    let attendance = [];
    let pendingLeaves = [];
    try {
      const attRes = await supabase
        .from('attendance')
        .select('id, employee_id, status, date')
        .gte('date', new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0, 10));
      attendance = attRes.data || [];
    } catch {}

    try {
      const leaveRes = await supabase
        .from('leave_requests')
        .select('id, status')
        .eq('status', 'pending');
      pendingLeaves = leaveRes.data || [];
    } catch {}

    const stats = {
      ...emptyStats,
      total_employees: employees.length,
      active_employees: employees.filter((e) => e.status === 'active').length,
      pending_leaves: pendingLeaves.length,
      attendance_last_30d: attendance.length,
    };

    for (const e of employees) {
      if (e.employment_type) stats.by_type[e.employment_type] = (stats.by_type[e.employment_type] || 0) + 1;
      if (e.role) stats.by_role[e.role] = (stats.by_role[e.role] || 0) + 1;
      if (e.department) stats.by_department[e.department] = (stats.by_department[e.department] || 0) + 1;
    }

    return stats;
  } catch (e) {
    return { ...emptyStats, setup_error: 'Error: ' + (e?.message || 'unknown') };
  }
}
