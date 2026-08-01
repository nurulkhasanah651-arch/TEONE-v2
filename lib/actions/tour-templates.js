'use server';

// Kelola template "Harga Tour Non-Umroh" (Khasanah) di tab Finance.
// Dipakai invoice utk memecah pokok jadi Paket Umroh + Paket Tour <negara>.
// Path: lib/actions/tour-templates.js
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function guard() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/finance'); if (g.error) return { error: g.error };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  return { user, db };
}

const intv = (v) => { const n = parseInt(String(v ?? '').replace(/[^0-9]/g, '')); return Number.isFinite(n) ? n : 0; };

export async function getTourTemplates() {
  const g = await guard(); if (g.error) return { error: g.error };
  const { data, error } = await g.db.from('tour_addon_templates')
    .select('id, label, keywords, amount, active, sort_order').order('sort_order', { ascending: true }).order('id', { ascending: true });
  if (error) return { error: error.message };
  return { ok: true, items: data || [] };
}

// Simpan (insert kalau tanpa id, update kalau ada id).
export async function saveTourTemplate(fields) {
  const g = await guard(); if (g.error) return { error: g.error };
  const label = String(fields?.label || '').trim();
  if (!label) return { error: 'Nama paket tour wajib diisi' };
  const amount = intv(fields?.amount);
  // keywords default dari label kalau kosong (huruf kecil).
  const keywords = String(fields?.keywords || '').trim() || label.toLowerCase();
  const active = fields?.active !== false;
  const sort_order = intv(fields?.sort_order);
  const row = { label, keywords, amount, active, sort_order, updated_at: new Date().toISOString() };
  const id = parseInt(fields?.id);
  let error;
  if (id) { ({ error } = await g.db.from('tour_addon_templates').update(row).eq('id', id)); }
  else { ({ error } = await g.db.from('tour_addon_templates').insert(row)); }
  if (error) return { error: error.message };
  revalidatePath('/finance');
  return { ok: true };
}

export async function deleteTourTemplate(id) {
  const g = await guard(); if (g.error) return { error: g.error };
  const rid = parseInt(id); if (!rid) return { error: 'Item tidak valid' };
  const { error } = await g.db.from('tour_addon_templates').delete().eq('id', rid);
  if (error) return { error: error.message };
  revalidatePath('/finance');
  return { ok: true };
}
