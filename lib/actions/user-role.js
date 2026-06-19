'use server';

// User role — Round 62: ULTRA-DEFENSIVE TL insert
// Insert minimal dulu (3 kolom), lalu update field optional per-field
// Skip kolom yang missing tanpa fail

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function setInternalRole(role, password) {
  if (!['cs', 'ops'].includes(role)) return { error: 'Role invalid.' };
  const expectedPassword = role === 'cs' ? process.env.TEONE_CS_PASSWORD : process.env.TEONE_OPS_PASSWORD;
  if (!expectedPassword) return { error: `Password role ${role.toUpperCase()} belum di-set di Vercel.` };
  if (!password || password.trim() !== expectedPassword) return { error: 'Password salah.' };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const { error } = await supabase.auth.updateUser({ data: { ...user.user_metadata, role } });
  if (error) return { error: error.message };
  return { ok: true, redirect: '/dashboard' };
}

export async function setTourLeaderRole(formData) {
  const name = (formData.get('name') || '').trim();
  const email = (formData.get('email') || '').trim().toLowerCase();
  const phone = (formData.get('phone') || '').trim();

  if (!name) return { error: 'Nama wajib diisi.' };
  if (!email) return { error: 'Email wajib diisi.' };
  if (!phone) return { error: 'No HP wajib diisi.' };
  if (!email.includes('@')) return { error: 'Format email tidak valid.' };
  if (phone.length < 8) return { error: 'No HP terlalu pendek.' };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Cari di master tour_leaders — defensive (no active filter, no specific column)
  let existing = null;
  let isNew = false;
  try {
    const { data: tls } = await supabase.from('tour_leaders').select('*');
    existing = (tls || []).find((t) => {
      const tEmail = (t.email || '').toLowerCase().trim();
      const tPhone = (t.phone || '').trim();
      // Skip kalau t.active explicitly false
      if (t.active === false) return false;
      return (tEmail === email && tPhone === phone) ||
             (tEmail === email && tEmail !== '') ||
             (tPhone === phone && tPhone !== '');
    });
  } catch (e) {
    return { error: 'Gagal akses master TL: ' + (e?.message || 'unknown') };
  }

  // PROTEKSI: 1 no HP tidak boleh diklaim akun/email lain.
  // Kalau no HP sudah terdaftar atas user_id atau email yang BERBEDA → tolak.
  const normP = (p) => String(p || '').replace(/\D/g, '').replace(/^0/, '62');
  try {
    const { data: allTls } = await supabase.from('tour_leaders').select('id, email, phone, user_id, active');
    const phoneOwner = (allTls || []).find((t) => t.active !== false && normP(t.phone) === normP(phone) && normP(phone).length >= 8);
    if (phoneOwner) {
      const ownerEmail = (phoneOwner.email || '').toLowerCase().trim();
      const ownerHasOtherUser = phoneOwner.user_id && phoneOwner.user_id !== user.id;
      const ownerHasOtherEmail = ownerEmail && ownerEmail !== email;
      if (ownerHasOtherUser || ownerHasOtherEmail) {
        return { error: 'No HP ini sudah terdaftar atas akun/email lain. Kalau ini nomormu, hubungi admin untuk perbarui datanya.' };
      }
    }
  } catch {}

  let tl = existing;

  if (!tl) {
    isNew = true;

    // STEP 1: Insert MINIMAL (cuma kolom paling esensial: name, email, phone)
    // Kolom optional di-set via update terpisah setelah insert berhasil
    const { data: newTl, error: createErr } = await supabase
      .from('tour_leaders')
      .insert({ name, email, phone })
      .select()
      .maybeSingle();

    if (createErr || !newTl) {
      return {
        error: 'Gagal daftar TL: ' + (createErr?.message || 'unknown') +
               '\n\nKalau error "could not find column", jalankan SQL ini di Supabase:\n\n' +
               'ALTER TABLE tour_leaders ADD COLUMN IF NOT EXISTS type TEXT DEFAULT \'freelance\';\n' +
               'ALTER TABLE tour_leaders ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;\n' +
               'ALTER TABLE tour_leaders ADD COLUMN IF NOT EXISTS notes TEXT;\n' +
               'ALTER TABLE tour_leaders ADD COLUMN IF NOT EXISTS created_by TEXT;\n' +
               "NOTIFY pgrst, 'reload schema';",
      };
    }
    tl = newTl;

    // STEP 2: Set optional fields satu per satu, skip kalau gagal
    const optionalUpdates = [
      { type: 'freelance' },
      { active: true },
      { notes: 'Auto-registered via Portal TL' },
      { created_by: 'self-register' },
    ];

    for (const upd of optionalUpdates) {
      try {
        await supabase.from('tour_leaders').update(upd).eq('id', tl.id);
      } catch {
        // Skip — kolom mungkin belum ada
      }
    }
  }

  if (!tl) return { error: 'Gagal verify atau daftar TL.' };

  // Tautkan akun Google ke record TL (user_id + email) supaya login berikutnya & portal langsung kenal
  try {
    const patch = { user_id: user.id };
    if (!tl.email && email) patch.email = email;
    await supabase.from('tour_leaders').update(patch).eq('id', tl.id);
  } catch {}

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
