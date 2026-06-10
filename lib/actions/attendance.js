'use server';

// Absensi — self check-in/out. Jam standar 09:00-17:00 (telat dari 09:00, lembur dari 17:00).
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';

const STD_IN_H = 9;    // 09:00
const STD_OUT_H = 17;  // 17:00

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false } });
}
function nowWIB() { return new Date(Date.now() + 7 * 3600 * 1000); }
function todayStr() { return nowWIB().toISOString().slice(0, 10); }
function hhmm(d) { return d.toISOString().slice(11, 16); }

// Cari / buat record karyawan untuk user yang login
async function getOrCreateMyEmployee(db, user) {
  let { data: emp } = await db.from('employees').select('*').eq('user_id', user.id).maybeSingle();
  if (emp) return emp;
  if (user.email) {
    const r = await db.from('employees').select('*').ilike('email', user.email).maybeSingle();
    if (r.data) {
      // tautkan user_id sekalian
      await db.from('employees').update({ user_id: user.id }).eq('id', r.data.id);
      return r.data;
    }
  }
  // buat baru dari profil akun
  const name = user.user_metadata?.name || user.user_metadata?.full_name || (user.email || '').split('@')[0];
  const role = user.app_metadata?.role || user.user_metadata?.role || 'other';
  const ins = await db.from('employees').insert({
    user_id: user.id, email: (user.email || '').toLowerCase(), full_name: name,
    role, status: 'active', employment_type: 'full_time',
  }).select('*').single();
  if (ins.error) throw new Error('Gagal membuat data karyawan: ' + ins.error.message);
  return ins.data;
}

export async function getMyAttendanceToday() {
 try {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = svc() || authClient;
  const emp = await getOrCreateMyEmployee(db, user);
  const { data: att } = await db.from('attendance')
    .select('*').eq('employee_id', emp.id).eq('date', todayStr()).maybeSingle();
  return { ok: true, employee: { id: emp.id, name: emp.full_name }, attendance: att || null, today: todayStr() };
 } catch (e) { return { error: e?.message || 'error' }; }
}

export async function clockIn() {
 try {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = svc() || authClient;
  const emp = await getOrCreateMyEmployee(db, user);
  const date = todayStr();
  const { data: existing } = await db.from('attendance').select('id, clock_in').eq('employee_id', emp.id).eq('date', date).maybeSingle();
  if (existing?.clock_in) return { error: 'Kamu sudah check-in hari ini' };

  const now = nowWIB();
  const stdIn = new Date(now); stdIn.setUTCHours(STD_IN_H, 0, 0, 0);
  const lateMin = Math.max(0, Math.round((now - stdIn) / 60000));
  const status = lateMin > 0 ? 'telat' : 'hadir';

  const payload = {
    employee_id: emp.id, date, clock_in: now.toISOString(),
    late_minutes: lateMin, status,
  };
  const { error } = await db.from('attendance').upsert(payload, { onConflict: 'employee_id,date' });
  if (error) return { error: error.message };
  revalidatePath('/hr/attendance');
  return { ok: true, time: hhmm(now), late: lateMin, status };
 } catch (e) { return { error: e?.message || 'error' }; }
}

export async function clockOut() {
 try {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = svc() || authClient;
  const emp = await getOrCreateMyEmployee(db, user);
  const date = todayStr();
  const { data: att } = await db.from('attendance').select('*').eq('employee_id', emp.id).eq('date', date).maybeSingle();
  if (!att?.clock_in) return { error: 'Belum check-in hari ini' };
  if (att.clock_out) return { error: 'Kamu sudah check-out hari ini' };

  const now = nowWIB();
  const inT = new Date(att.clock_in);
  const workHours = Math.max(0, Math.round(((now - inT) / 3600000) * 100) / 100);
  const stdOut = new Date(now); stdOut.setUTCHours(STD_OUT_H, 0, 0, 0);
  const overtime = Math.max(0, Math.round(((now - stdOut) / 3600000) * 100) / 100);

  const { error } = await db.from('attendance')
    .update({ clock_out: now.toISOString(), work_hours: workHours, overtime_hours: overtime })
    .eq('id', att.id);
  if (error) return { error: error.message };
  revalidatePath('/hr/attendance');
  return { ok: true, time: hhmm(now), workHours, overtime };
 } catch (e) { return { error: e?.message || 'error' }; }
}
