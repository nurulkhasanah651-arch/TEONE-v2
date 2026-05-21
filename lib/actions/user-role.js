'use server';

// User role server actions — set role di Supabase user_metadata
// + verify TL via master tour_leaders

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Set role untuk Internal Team (CS atau Ops)
export async function setInternalRole(role) {
  if (!['cs', 'ops'].includes(role)) {
    return { error: 'Role invalid. Pilih CS atau Ops.' };
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.auth.updateUser({
    data: { ...user.user_metadata, role },
  });

  if (error) return { error: error.message };

  return { ok: true, redirect: '/dashboard' };
}

// Set role untuk Tour Leader (verifikasi via master tour_leaders)
export async function setTourLeaderRole(formData) {
  const email = (formData.get('email') || '').trim().toLowerCase();
  const phone = (formData.get('phone') || '').trim();

  if (!email || !phone) {
    return { error: 'Email dan No HP wajib diisi' };
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Cari di master tour_leaders — match email OR phone
  const { data: tls, error: searchErr } = await supabase
    .from('tour_leaders')
    .select('*')
    .eq('active', true);

  if (searchErr) return { error: 'Gagal cek master TL: ' + searchErr.message };

  const tl = (tls || []).find((t) => {
    const emailMatch = t.email && t.email.toLowerCase().trim() === email;
    const phoneMatch = t.phone && t.phone.trim() === phone;
    return emailMatch && phoneMatch;
  });

  if (!tl) {
    // Coba match email aja, kalau phone beda
    const emailOnly = (tls || []).find((t) => t.email && t.email.toLowerCase().trim() === email);
    if (emailOnly) {
      return { error: `Email ditemukan di master, tapi no HP tidak match. No HP terdaftar: ${emailOnly.phone || '(belum diisi)'}. Hubungi admin untuk update data TL.` };
    }
    return { error: 'Data tidak ditemukan di master Tour Leader. Hubungi admin untuk daftarkan email & no HP kamu dulu.' };
  }

  // Save role + tl_id ke user_metadata
  const { error } = await supabase.auth.updateUser({
    data: {
      ...user.user_metadata,
      role: 'tour_leader',
      tl_id: tl.id,
      tl_name: tl.name,
    },
  });

  if (error) return { error: error.message };

  return { ok: true, redirect: '/tl', tlName: tl.name };
}

// Reset role (untuk testing atau kalau salah pilih)
export async function resetRole() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const meta = { ...user.user_metadata };
  delete meta.role;
  delete meta.tl_id;
  delete meta.tl_name;

  const { error } = await supabase.auth.updateUser({ data: meta });
  if (error) return { error: error.message };

  return { ok: true };
}

// Sign out
export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
