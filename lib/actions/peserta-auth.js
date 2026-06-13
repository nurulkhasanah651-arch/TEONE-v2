'use server';

// Akun peserta (customer) — registrasi via service role, tautkan ke customers.
import { createClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';

function svc() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function normPhone(p) { return String(p || '').replace(/\D/g, '').replace(/^0/, '62'); }

// Buat akun peserta. Mengembalikan { ok, status: 'created'|'exists', userId? } atau { error }.
export async function createPesertaAccount({ name, email, phone, password, customerId } = {}) {
  const db = svc();
  if (!db) return { error: 'Server belum siap' };
  email = String(email || '').trim().toLowerCase();
  password = String(password || '');
  if (!email) return { error: 'Email wajib diisi untuk membuat akun' };
  if (password.length < 6) return { error: 'Password minimal 6 karakter' };

  // Sudah terdaftar?
  let existingUserId = null;
  try {
    const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = (list?.users || []).find((u) => (u.email || '').toLowerCase() === email);
    if (found) existingUserId = found.id;
  } catch { /* lanjut */ }

  if (existingUserId) {
    await linkCustomer(db, existingUserId, { customerId, email, phone });
    return { ok: true, status: 'exists', userId: existingUserId };
  }

  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'peserta', name: name || '', phone: normPhone(phone) },
  });
  if (error) {
    if (/already|registered|exists/i.test(error.message || '')) {
      return { ok: true, status: 'exists' };
    }
    return { error: 'Gagal membuat akun: ' + error.message };
  }
  const userId = data?.user?.id || null;
  if (userId) await linkCustomer(db, userId, { customerId, email, phone });
  return { ok: true, status: 'created', userId };
}

async function linkCustomer(db, userId, { customerId, email, phone }) {
  try {
    if (customerId) {
      await db.from('customers').update({ user_id: userId }).eq('id', customerId);
      return;
    }
    const np = normPhone(phone);
    if (np) {
      const { data } = await db.from('customers').select('id').eq('phone', np).limit(1).maybeSingle();
      if (data) { await db.from('customers').update({ user_id: userId, email: email || null }).eq('id', data.id); return; }
    }
    if (email) {
      const { data } = await db.from('customers').select('id').ilike('email', email).limit(1).maybeSingle();
      if (data) await db.from('customers').update({ user_id: userId }).eq('id', data.id);
    }
  } catch { /* best-effort */ }
}


// Cek apakah email (akun auth) atau No HP (customer ber-akun) sudah terdaftar.
export async function checkIdentityTaken({ email, phone } = {}) {
  const db = svc();
  if (!db) return { emailTaken: false, phoneTaken: false };
  email = String(email || '').trim().toLowerCase();
  const np = normPhone(phone);
  let emailTaken = false, phoneTaken = false;
  try {
    if (email) {
      const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
      emailTaken = (list?.users || []).some((u) => (u.email || '').toLowerCase() === email);
    }
  } catch {}
  try {
    if (np) {
      const { data } = await db.from('customers').select('id, user_id').eq('phone', np).not('user_id', 'is', null).limit(1).maybeSingle();
      phoneTaken = !!data;
    }
  } catch {}
  return { emailTaken, phoneTaken };
}
