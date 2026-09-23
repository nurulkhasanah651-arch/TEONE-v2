'use server';

// Akun peserta (customer) — registrasi via service role, tautkan ke customers.
import { createClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { assertStaff } from '@/lib/auth/require-staff';
import { customerSiteUrlFor } from '@/lib/brand-shared';
import { sendFonnte, normalizePhone } from '@/lib/utils/fonnte';

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

  // 1 No HP = 1 akun: tolak buat akun baru bila No HP sudah dipakai akun LAIN.
  const npNew = normPhone(phone);
  if (npNew) {
    try {
      const { data: owner } = await db.from('customers')
        .select('id, user_id, email').eq('phone', npNew).not('user_id', 'is', null).limit(1).maybeSingle();
      if (owner && owner.user_id) {
        let ownerEmail = (owner.email || '').toLowerCase();
        try { const { data: u } = await db.auth.admin.getUserById(owner.user_id); if (u?.user?.email) ownerEmail = u.user.email.toLowerCase(); } catch {}
        if (!ownerEmail || ownerEmail !== email) {
          return { error: 'No HP ini sudah terdaftar di akun lain. Silakan login pakai nomor tersebut di menu Masuk.', phoneTaken: true };
        }
      }
    } catch { /* best-effort */ }
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


// Resolve identifier login (email ATAU no HP) → email akun auth.
// Dipakai halaman /masuk supaya peserta bisa login pakai email atau nomor HP.
export async function resolvePesertaLogin(identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) return { error: 'Isi email atau no HP dulu' };
  // Kalau ada '@' anggap email
  if (raw.includes('@')) return { ok: true, email: raw.toLowerCase() };

  const db = svc();
  if (!db) return { error: 'Server belum siap' };
  const np = normPhone(raw);
  if (!np || np.length < 8) return { error: 'No HP tidak valid' };

  try {
    // Cari customer dgn nomor itu yang sudah punya akun
    const { data: cust } = await db
      .from('customers')
      .select('id, email, user_id')
      .eq('phone', np)
      .not('user_id', 'is', null)
      .limit(1)
      .maybeSingle();
    if (!cust) return { error: 'Nomor HP ini belum punya akun. Coba pakai email, atau pesan trip dulu untuk buat akun.' };

    // Ambil email akun auth (utamakan email akun auth, fallback ke email customer)
    let email = cust.email || null;
    try {
      const { data: u } = await db.auth.admin.getUserById(cust.user_id);
      if (u?.user?.email) email = u.user.email;
    } catch {}
    if (!email) return { error: 'Akun ditemukan tapi email tidak tersedia. Hubungi admin.' };
    return { ok: true, email: String(email).toLowerCase() };
  } catch (e) {
    return { error: 'Gagal cek nomor HP. Coba lagi.' };
  }
}


// ADMIN: buatkan / kirim ulang akses akun peserta.
// Alur: pastikan akun auth ada (buat kalau belum) -> generate link RECOVERY (peserta
// atur password sendiri) -> kirim via WhatsApp (Fonnte) + kembalikan link utk di-copy.
// Password TIDAK pernah ditentukan admin: peserta yang set sendiri lewat link.
// Hanya staf internal yang boleh memanggil.
export async function sendPesertaAccessLink({ customerId, email: emailOverride = '', channel = 'wa' } = {}) {
  // Guard staf internal
  try {
    const sb = createServerClient();
    const { data: { user } } = await sb.auth.getUser();
    const guard = await assertStaff(user);
    if (guard.error) return { error: guard.error };
  } catch {
    return { error: 'Akses ditolak.' };
  }

  const db = svc();
  if (!db) return { error: 'Server belum siap' };
  if (!customerId) return { error: 'Peserta tidak valid' };

  const { data: cust } = await db.from('customers')
    .select('id, name, first_name, surname, phone, email, user_id')
    .eq('id', customerId).maybeSingle();
  if (!cust) return { error: 'Peserta tidak ditemukan' };

  const name = (cust.name || `${cust.first_name || ''} ${cust.surname || ''}`.trim() || 'Peserta').trim();

  // Tentukan email akun
  let email = String(emailOverride || '').trim().toLowerCase();
  if (!email && cust.user_id) {
    try { const { data: u } = await db.auth.admin.getUserById(cust.user_id); if (u?.user?.email) email = u.user.email.toLowerCase(); } catch {}
  }
  if (!email) email = String(cust.email || '').trim().toLowerCase();
  if (!email) return { error: 'need_email', needEmail: true };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: 'Format email tidak valid', needEmail: true };

  // Pastikan akun auth ada
  let userId = null;
  try {
    const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = (list?.users || []).find((u) => (u.email || '').toLowerCase() === email);
    if (found) userId = found.id;
  } catch {}

  let created = false;
  if (!userId) {
    // Password acak sekali-pakai — langsung diganti peserta lewat link recovery.
    const rand = 'Tp' + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8).toUpperCase() + '9!';
    const { data, error } = await db.auth.admin.createUser({
      email, password: rand, email_confirm: true,
      user_metadata: { role: 'peserta', name, phone: normPhone(cust.phone) },
    });
    if (error && !/already|registered|exists/i.test(error.message || '')) {
      return { error: 'Gagal membuat akun: ' + error.message };
    }
    userId = data?.user?.id || null;
    created = true;
    if (!userId) {
      try { const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 }); const f = (list?.users || []).find((u) => (u.email || '').toLowerCase() === email); userId = f?.id || null; } catch {}
    }
  }

  // Tautkan customer (isi user_id / email bila masih kosong; jangan timpa data lain)
  try {
    const upd = {};
    if (userId && !cust.user_id) upd.user_id = userId;
    if (!cust.email && email) upd.email = email;
    if (Object.keys(upd).length) await db.from('customers').update(upd).eq('id', cust.id);
  } catch {}

  // Generate link recovery (peserta atur password sendiri)
  const brand = (() => { try { return currentBrandCode() || ''; } catch { return ''; } })();
  const base = customerSiteUrlFor(brand);
  let link = '';
  try {
    const { data: gen, error: gErr } = await db.auth.admin.generateLink({
      type: 'recovery', email, options: { redirectTo: `${base}/reset-password` },
    });
    if (gErr) return { error: 'Gagal membuat link: ' + gErr.message };
    const ht = gen?.properties?.hashed_token;
    link = ht ? `${base}/reset-password?token_hash=${ht}&type=recovery` : (gen?.properties?.action_link || '');
  } catch (e) {
    return { error: 'Gagal membuat link: ' + (e?.message || '') };
  }
  if (!link) return { error: 'Link tidak tersedia. Coba lagi.' };

  // Kirim via WhatsApp
  let waSent = false, waErr = '';
  const phone = cust.phone || '';
  if ((channel === 'wa' || channel === 'both') && phone) {
    const brandName = brand === 'khasanah' ? 'Khasanah Travel' : 'TravelingEropa';
    const msg = `Halo ${name} 👋\n\nBerikut link untuk mengatur password akun peserta ${brandName} kamu. Klik lalu buat password baru:\n\n${link}\n\nSetelah selesai, login di ${base}/masuk pakai:\n📧 Email: ${email}\n🔑 Password: yang baru kamu buat\n\nLink ini berlaku terbatas. Kalau sudah kedaluwarsa, minta admin kirim ulang ya. 🙏`;
    try {
      const r = await sendFonnte(normalizePhone(phone), msg, { context: 'cs', brand });
      waSent = !r?.error;
      if (r?.error) waErr = r.error;
    } catch (e) { waErr = e?.message || 'Gagal kirim WA'; }
  }

  return { ok: true, link, email, created, waSent, waErr, phone };
}
