'use server';

// Master Tour Leader server actions

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function createTourLeader(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const name = (formData.get('name') || '').trim();
  const email = (formData.get('email') || '').trim().toLowerCase() || null;
  const phone = (formData.get('phone') || '').trim() || null;
  const type = formData.get('type') || 'inhouse';
  const notes = (formData.get('notes') || '').trim() || null;

  if (!name) return { error: 'Nama TL wajib' };
  if (!['inhouse', 'freelance'].includes(type)) return { error: 'Tipe harus inhouse/freelance' };

  const created_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { error } = await supabase.from('tour_leaders').insert({
    name, email, phone, type, notes, created_by, active: true,
  });

  if (error) return { error: error.message };

  revalidatePath('/tl-master');
  return { ok: true };
}

export async function updateTourLeader(id, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const name = (formData.get('name') || '').trim();
  const email = (formData.get('email') || '').trim().toLowerCase() || null;
  const phone = (formData.get('phone') || '').trim() || null;
  const type = formData.get('type') || 'inhouse';
  const notes = (formData.get('notes') || '').trim() || null;
  const active = formData.get('active') === 'on' || formData.get('active') === 'true';

  if (!name) return { error: 'Nama TL wajib' };

  const { error } = await supabase
    .from('tour_leaders')
    .update({ name, email, phone, type, notes, active })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/tl-master');
  return { ok: true };
}

export async function toggleTourLeaderActive(id, active) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('tour_leaders')
    .update({ active })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/tl-master');
  return { ok: true };
}

export async function deleteTourLeader(id) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.from('tour_leaders').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/tl-master');
  return { ok: true };
}

// Verifikasi TL by email + phone (untuk login flow di Round 37)
export async function findTourLeaderByCredentials(email, phone) {
  const supabase = createClient();

  let q = supabase.from('tour_leaders').select('*').eq('active', true);
  if (email) q = q.eq('email', email.toLowerCase().trim());
  if (phone) q = q.eq('phone', phone.trim());

  const { data, error } = await q.maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'TL tidak ditemukan. Pastikan email & no HP terdaftar di sistem.' };
  return { ok: true, tl: data };
}

// Self-register sebagai Tour Leader via No HP — hanya berhasil kalau HP cocok di master TL
function _normPhone(p) { return String(p || '').replace(/\D/g, '').replace(/^0/, '62'); }

export async function registerAsTourLeader(formData) {
  const phone = (formData.get('phone') || '').trim();
  if (!phone) return { error: 'No HP wajib diisi' };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const np = _normPhone(phone);
  const { data: all } = await supabase.from('tour_leaders').select('*');
  const match = (all || []).find((t) => _normPhone(t.phone) === np && t.active !== false);
  if (!match) {
    return { error: 'Nomor HP belum terdaftar sebagai Tour Leader. Hubungi admin untuk didaftarkan dulu.' };
  }
  // link akun + set role
  await supabase.from('tour_leaders').update({
    user_id: user.id, email: user.email || match.email,
  }).eq('id', match.id);
  await supabase.from('users').upsert(
    { id: user.id, email: user.email, name: match.name, role: 'tour_leader' },
    { onConflict: 'id' }
  );
  await supabase.auth.updateUser({ data: { ...user.user_metadata, role: 'tour_leader' } });
  return { ok: true, redirect: '/tl' };
}
