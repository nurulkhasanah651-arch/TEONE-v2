'use server';

// User role actions — Round 61: TL auto-register dengan DEFENSIVE insert
// Kalau kolom optional (created_by, notes, active) belum ada → retry tanpa field tsb

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

// Tour Leader auto-register — Round 61 defensive
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

  // Cari di master tour_leaders — defensive (kalau active column ga ada, fetch all)
  let existing = null;
  let isNew = false;
  try {
    let { data: tls, error: searchErr } = await supabase
      .from('tour_leaders').select('*').eq('active', true);
    if (searchErr && /active/.test(searchErr.message || '')) {
      // Kolom active belum ada, fallback select tanpa filter
      const retry = await supabase.from('tour_leaders').select('*');
      tls = retry.data;
    }

    existing = (tls || []).find((t) => {
      const tEmail = (t.email || '').toLowerCase().trim();
      const tPhone = (t.phone || '').trim();
      return (tEmail === email && tPhone === phone) ||
             (tEmail === email && tEmail !== '') ||
             (tPhone === phone && tPhone !== '');
    });
  } catch (e) {
    return { error: 'Gagal akses master TL: ' + (e?.message || 'unknown') };
  }

  let tl = existing;

  // Auto-register kalau tidak ada — try minimal insert pertama
  if (!tl) {
    isNew = true;

    // Minimal payload (kolom wajib saja)
    const minimalPayload = { name, email, phone, type: 'freelance' };
    // Full payload (dengan optional fields)
    const fullPayload = {
      ...minimalPayload,
      notes: 'Auto-registered via Portal TL',
      active: true,
      created_by: 'self-register',
    };

    // Try full payload first
    let { data: newTl, error: createErr } = await supabase
      .from('tour_leaders').insert(fullPayload).select().maybeSingle();

    // Kalau ada kolom optional yang ga ada → retry minimal
    if (createErr && /(created_by|notes|active)/.test(createErr.message || '')) {
      const retry = await supabase.from('tour_leaders').insert(minimalPayload).select().maybeSingle();
      newTl = retry.data;
      createErr = retry.error;
    }

    if (createErr || !newTl) {
      return {
        error: 'Gagal daftar otomatis: ' + (createErr?.message || 'unknown') +
               '. Coba jalankan SQL ini di Supabase:\n\n' +
               'ALTER TABLE tour_leaders ADD COLUMN IF NOT EXISTS created_by TEXT;\n' +
               'ALTER TABLE tour_leaders ADD COLUMN IF NOT EXISTS notes TEXT;\n' +
               'ALTER TABLE tour_leaders ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;\n' +
               "NOTIFY pgrst, 'reload schema';",
      };
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

  return { ok: true, redirect: '/tl', tlName: tl.name, isNew };
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
