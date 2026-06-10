'use server';

// KPI — definisi metrik per role + realisasi bulanan (auto dari data + manual)
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false } });
}
async function requireAdmin() {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const role = user.app_metadata?.role || user.user_metadata?.role || null;
  if (!['owner', 'accounting', 'manager'].includes(role)) return { error: 'Hanya owner/accounting/manager' };
  return { user, db: svc() || authClient };
}

function achievement(actual, target, higher) {
  const a = Number(actual || 0), t = Number(target || 0);
  if (t <= 0) return 0;
  const pct = higher ? (a / t) * 100 : (a > 0 ? (t / a) * 100 : 0);
  return Math.round(pct * 10) / 10;
}

// Hitung nilai otomatis per karyawan untuk metric_key tertentu (data CS bulan itu)
async function autoValues(db, year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const { data: ups } = await db.from('cs_daily_updates')
    .select('cs_officer, total_terjual_hari_ini, jumlah_leads').gte('tanggal', start).lte('tanggal', end);
  const byOfficer = {};
  for (const u of (ups || [])) {
    const key = (u.cs_officer || '').trim().toLowerCase();
    if (!key) continue;
    if (!byOfficer[key]) byOfficer[key] = { cs_closing: 0, cs_leads: 0 };
    byOfficer[key].cs_closing += Number(u.total_terjual_hari_ini || 0);
    byOfficer[key].cs_leads += Number(u.jumlah_leads || 0);
  }
  return byOfficer; // { officerNameLower: {cs_closing, cs_leads} }
}

export async function getKpiData(year, month) {
 try {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = svc() || authClient;

  const [{ data: defs }, { data: emps }, { data: recs }] = await Promise.all([
    db.from('kpi_definitions').select('*').eq('active', true).order('role').order('id'),
    db.from('employees').select('id, full_name, role, status').neq('status', 'inactive').order('full_name'),
    db.from('kpi_records').select('*').eq('period_year', year).eq('period_month', month),
  ]);

  const auto = await autoValues(db, year, month).catch(() => ({}));

  return {
    ok: true,
    definitions: defs || [],
    employees: emps || [],
    records: recs || [],
    autoByOfficer: auto,
  };
 } catch (e) { return { error: e?.message || 'error' }; }
}

export async function upsertKpiDefinition(data) {
  const g = await requireAdmin(); if (g.error) return g;
  const payload = {
    role: (data.role || '').trim() || null,
    metric_key: (data.metric_key || '').trim() || ('m_' + Date.now()),
    metric_label: (data.metric_label || '').trim(),
    metric_description: (data.metric_description || '').trim() || null,
    metric_type: data.metric_type || 'number',
    data_source: data.data_source || 'manual',
    target_value: parseFloat(data.target_value) || 0,
    weight: parseFloat(data.weight) || 1,
    unit: (data.unit || '').trim() || null,
    higher_is_better: data.higher_is_better !== false,
    active: true,
  };
  if (!payload.metric_label) return { error: 'Nama metrik wajib diisi' };
  const db = g.db;
  let res;
  if (data.id) res = await db.from('kpi_definitions').update(payload).eq('id', data.id);
  else res = await db.from('kpi_definitions').insert(payload);
  if (res.error) return { error: res.error.message };
  revalidatePath('/hr/kpi');
  return { ok: true };
}

export async function deleteKpiDefinition(id) {
  const g = await requireAdmin(); if (g.error) return g;
  const { error } = await g.db.from('kpi_definitions').update({ active: false }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/hr/kpi');
  return { ok: true };
}

export async function saveKpiActual({ employee_id, kpi_definition_id, year, month, target_value, actual_value, notes, higher_is_better, weight }) {
  const g = await requireAdmin(); if (g.error) return g;
  const pct = achievement(actual_value, target_value, higher_is_better !== false);
  const score = Math.min(120, Math.max(0, pct));
  const weighted = Math.round(score * (Number(weight) || 1) * 10) / 10;
  const payload = {
    employee_id, kpi_definition_id, period_year: year, period_month: month,
    target_value: parseFloat(target_value) || 0,
    actual_value: parseFloat(actual_value) || 0,
    achievement_pct: pct, score, weighted_score: weighted,
    notes: (notes || '').trim() || null,
    reviewed_by: g.user.email || 'hr', reviewed_at: new Date().toISOString(),
  };
  const { error } = await g.db.from('kpi_records').upsert(payload, { onConflict: 'employee_id,kpi_definition_id,period_year,period_month' });
  if (error) return { error: error.message };
  revalidatePath('/hr/kpi');
  return { ok: true };
}
