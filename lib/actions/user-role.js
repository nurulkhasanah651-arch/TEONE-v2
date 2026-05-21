'use server';

// User role server actions
// Round 41: password protect untuk role CS & Ops

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Set role untuk Internal Team (CS atau Ops) — butuh password
export async function setInternalRole(role, password) {
  if (!['cs', 'ops'].includes(role)) {
    return { error: 'Role invalid. Pilih CS atau Ops.' };
  }

  // Password check — dibaca dari Vercel env vars
  const expectedPassword = role === 'cs'
    ? process.env.TEONE_CS_PASSWORD
    : process.env.TEONE_OPS_PASSWORD;

  if (!expectedPassword) {
    return {
      error: `Password role ${role.toUpperCase()} belum di-set di Vercel. Hubungi Owner untuk set environment variable TEONE_${role.toUpperCase()}_PASSWORD di Vercel.`,
    };
  }

  if (!password || password.trim() !== expectedPassword) {
    return { error: 'Password salah. Hubungi admin/owner untuk minta password role kamu.' };
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
    const emailOnly = (tls || []).find((t) => t.email && t.email.toLowerCase().trim() === email);
    if (emailOnly) {
      return { error: `Email ditemukan di master, tapi no HP tidak match. No HP terdaftar: ${emailOnly.phone || '(belum diisi)'}. Hubungi admin untuk update data TL.` };
    }
    return { error: 'Data tidak ditemukan di master Tour Leader. Hubungi admin untuk daftarkan email & no HP kamu dulu.' };
  }

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

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
