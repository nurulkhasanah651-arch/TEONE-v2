'use server';

// User role actions — Round 60: TL AUTO-REGISTER
//   - Cek match di master TL → pakai existing
//   - Kalau tidak match → auto-create entry baru, langsung aktif

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function setInternalRole(role, password) {
  if (!['cs', 'ops'].includes(role)) {
    return { error: 'Role invalid. Pilih CS atau Ops.' };
  }

  const expectedPassword = role === 'cs'
    ? process.env.TEONE_CS_PASSWORD
    : process.env.TEONE_OPS_PASSWORD;

  if (!expectedPassword) {
    return { error: `Password role ${role.toUpperCase()} belum di-set di Vercel. Hubungi Owner.` };
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

// Set role Tour Leader — AUTO-REGISTER kalau email+HP belum terdaftar
export async function setTourLeaderRole(formData) {
  const name = (formData.get('name') || '').trim();
  const email = (formData.get('email') || '').trim().toLowerCase();
  const phone = (formData.get('phone') || '').trim();

  if (!name) return { error: 'Nama wajib diisi.' };
  if (!email) return { error: 'Email wajib diisi.' };
  if (!phone) return { error: 'No HP / WhatsApp wajib diisi.' };
  if (!email.includes('@')) return { error: 'Format email tidak valid.' };
  if (phone.length < 8) return { error: 'No HP terlalu pendek (minimal 8 digit).' };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Cari di master tour_leaders
  let existing = null;
  let isNew = false;
  try {
    const { data: tls } = await supabase
      .from('tour_leaders')
      .select('*')
      .eq('active', true);
    existing = (tls || []).find((t) => {
      const tEmail = (t.email || '').toLowerCase().trim();
      const tPhone = (t.phone || '').trim();
      // Match email DAN phone, ATAU email aja, ATAU phone aja
      return (tEmail === email && tPhone === phone) ||
             (tEmail === email) ||
             (tPhone === phone);
    });
  } catch (e) {
    return { error: 'Gagal akses master TL: ' + (e?.message || 'unknown') };
  }

  let tl = existing;

  // Kalau tidak ada → auto-register
  if (!tl) {
    isNew = true;
    const { data: newTl, error: createErr } = await supabase
      .from('tour_leaders')
      .insert({
        name,
        email,
        phone,
        type: 'freelance',  // default — admin bisa edit jadi inhouse nanti
        notes: 'Auto-registered via Portal TL',
        active: true,
        created_by: 'self-register',
      })
      .select()
      .maybeSingle();

    if (createErr) {
      return { error: 'Gagal daftar otomatis: ' + createErr.message + '. Hubungi admin.' };
    }
    tl = newTl;
  }

  if (!tl) return { error: 'Gagal verify atau daftar TL. Hubungi admin.' };

  // Set role + tl_id
  const { error } = await supabase.auth.updateUser({
    data: {
      ...user.user_metadata,
      role: 'tour_leader',
      tl_id: tl.id,
      tl_name: tl.name,
    },
  });

  if (error) return { error: error.message };

  return {
    ok: true,
    redirect: '/tl',
    tlName: tl.name,
    isNew,
  };
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
