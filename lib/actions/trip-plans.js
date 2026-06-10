'use server';

// Plan Trip — rencana penjualan trip 6-12 bulan ke depan (board per region)
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const ROLES_OK = ['owner', 'accounting', 'manager', 'ops'];

async function guard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const role = user.app_metadata?.role || user.user_metadata?.role || user.app_metadata?.role || null;
  if (!ROLES_OK.includes(role)) return { error: 'Hanya owner/accounting/manager/ops' };
  return { supabase, user };
}

function parse(formData) {
  const intOrNull = (v) => { const n = parseInt(String(v || '').replace(/[^0-9-]/g, ''), 10); return Number.isNaN(n) ? null : n; };
  return {
    region: (formData.get('region') || 'other').trim(),
    title: (formData.get('title') || '').trim(),
    planned_departure: formData.get('planned_departure') || null,
    price: intOrNull(formData.get('price')),
    release_deadline: formData.get('release_deadline') || null,
    status: formData.get('status') || 'ide',
    duration_days: intOrNull(formData.get('duration_days')),
    target_pax: intOrNull(formData.get('target_pax')),
    notes: (formData.get('notes') || '').trim() || null,
  };
}

export async function createTripPlan(formData) {
  const g = await guard(); if (g.error) return g;
  const row = parse(formData);
  if (!row.title) return { error: 'Judul rencana wajib diisi' };
  row.created_by = g.user.user_metadata?.name || g.user.email || 'unknown';
  const { error } = await g.supabase.from('trip_plans').insert(row);
  if (error) return { error: error.message };
  revalidatePath('/plan');
  return { ok: true };
}

export async function updateTripPlan(id, formData) {
  const g = await guard(); if (g.error) return g;
  const row = parse(formData);
  if (!row.title) return { error: 'Judul rencana wajib diisi' };
  row.updated_at = new Date().toISOString();
  const { error } = await g.supabase.from('trip_plans').update(row).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/plan');
  return { ok: true };
}

export async function setTripPlanStatus(id, status) {
  const g = await guard(); if (g.error) return g;
  if (!['ide', 'rencana', 'rilis', 'batal'].includes(status)) return { error: 'status invalid' };
  const { error } = await g.supabase.from('trip_plans').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/plan');
  return { ok: true };
}

export async function deleteTripPlan(id) {
  const g = await guard(); if (g.error) return g;
  const { error } = await g.supabase.from('trip_plans').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/plan');
  return { ok: true };
}
