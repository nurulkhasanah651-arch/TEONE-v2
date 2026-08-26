'use server';

// Blast TL — kirim informasi via WhatsApp ke SEMUA Tour Leader (nama + no HP),
// pengirim TETAP pakai nomor Fonnte PIC "Putri" (apa pun brand yang dibuka).
// Daftar TL = brand aktif (employees employment_type='tour_leader').
// Riwayat WA otomatis tercatat di History WA (wa_log) oleh sendFonnte.
// Path: lib/actions/tl-blast.js

import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode, serviceClientFor } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';
import { getBrandCode } from '@/lib/brand';
import { sendFonnte } from '@/lib/utils/fonnte';

const BLAST_DELAY = '70-140'; // Fonnte spread antar pesan (detik) — anti-spam

function svc() {
  const u = brandSupabaseUrl(); const k = brandServiceRoleKey();
  return (u && k) ? createSvc(u, k, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

// Token Fonnte "Putri" — pengirim tetap. Record-nya ada di DB TEONE (employees full_name 'Putri').
// Cari di TEONE dulu, lalu brand aktif sebagai cadangan. Null → sendFonnte fallback token env.
async function putriToken() {
  let active = 'teone';
  try { active = currentBrandCode(); } catch {}
  const codes = [...new Set(['teone', active])];
  for (const code of codes) {
    const db = serviceClientFor(code); if (!db) continue;
    for (const col of ['full_name', 'nickname']) {
      try {
        const { data } = await db.from('employees').select('fonnte_token').ilike(col, '%putri%').limit(5);
        const hit = (data || []).find((r) => r.fonnte_token && String(r.fonnte_token).trim());
        if (hit) return String(hit.fonnte_token).trim();
      } catch {}
    }
  }
  return null;
}

// Daftar TL brand aktif + no HP.
export async function getTlBlastList() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/tl-blast'); if (g.error) return { error: g.error };
  const db = svc() || supabase;
  const { data, error } = await db.from('employees')
    .select('id, full_name, nickname, phone, whatsapp, status, tl_subtype')
    .eq('employment_type', 'tour_leader')
    .order('full_name', { ascending: true });
  if (error) return { error: error.message };
  const tls = (data || [])
    .filter((t) => !['inactive', 'resigned'].includes(t.status))
    .map((t) => ({
      id: t.id,
      name: (t.nickname || t.full_name || '').trim(),
      phone: (t.phone || t.whatsapp || '').trim(),
      subtype: t.tl_subtype || '',
    }))
    .filter((t) => t.name && t.phone);
  return { ok: true, tls, brand: getBrandCode() };
}

// Kirim blast ke semua / sebagian TL (selectedIds) dari nomor Putri.
export async function sendTlBlast(message, selectedIds) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/tl-blast'); if (g.error) return { error: g.error };

  const msg = String(message || '').trim();
  if (!msg) return { error: 'Pesan tidak boleh kosong.' };

  const r = await getTlBlastList(); if (r.error) return { error: r.error };
  const sel = Array.isArray(selectedIds) && selectedIds.length ? new Set(selectedIds.map(String)) : null;
  const pool = sel ? r.tls.filter((t) => sel.has(String(t.id))) : r.tls;
  if (!pool.length) return { error: 'Tidak ada TL terpilih.' };

  const token = await putriToken();
  const brand = getBrandCode();

  let sent = 0, failed = 0;
  const failedNames = [];
  for (const tl of pool) {
    const firstName = tl.name.split(/\s+/)[0] || 'Kak';
    const personalized = msg
      .replace(/\{\{\s*nama\s*\}\}/gi, firstName)
      .replace(/\{\{\s*phone\s*\}\}/gi, tl.phone);
    let ok = false;
    try {
      const res = await sendFonnte(tl.phone, personalized, {
        context: 'tl', brand, token: token || undefined,
        delay: BLAST_DELAY, typing: true, kind: 'blast-tl',
      });
      ok = !!res?.ok;
    } catch { ok = false; }
    if (ok) sent++; else { failed++; failedNames.push(tl.name); }
  }

  return { ok: true, sent, failed, total: pool.length, usedPutri: !!token, failedNames: failedNames.slice(0, 20) };
}
