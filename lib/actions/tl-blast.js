'use server';

// Blast TL — kirim informasi via WhatsApp ke SEMUA Tour Leader (nama + no HP).
// GABUNGAN 2 brand: TL TEONE + TL Khasanah jadi SATU daftar (mirip sistem plotting TL),
// dan SEMUA dikirim lewat SATU nomor: CS TravelingEropa (env FONNTE_TOKEN_CS brand TEONE),
// apa pun brand yang sedang dibuka.
// Riwayat WA otomatis tercatat di History WA (wa_log) oleh sendFonnte.
// Path: lib/actions/tl-blast.js

import { createClient } from '@/lib/supabase/server';
import { serviceClientFor } from '@/lib/supabase/service-env';
import { BRAND_CODES } from '@/lib/brand-shared';
import { assertStaff } from '@/lib/auth/require-staff';
import { sendFonnte } from '@/lib/utils/fonnte';

const BLAST_DELAY = '70-140'; // Fonnte spread antar pesan (detik) — anti-spam

// Pengirim blast: nomor CS TravelingEropa (brand TEONE) — dipaksa apa pun brand yang dibuka.
const SENDER_CONTEXT = 'cs';
const SENDER_BRAND = 'teone';

const BRAND_LABEL = { teone: 'TEONE', khasanah: 'Khasanah' };

// Ambil TL 1 brand (employees employment_type='tour_leader'), tag brand.
async function pullTlsForBrand(code) {
  const db = serviceClientFor(code);
  if (!db) return [];
  try {
    const { data, error } = await db.from('employees')
      .select('id, full_name, nickname, phone, whatsapp, status, tl_subtype')
      .eq('employment_type', 'tour_leader')
      .order('full_name', { ascending: true });
    if (error) return [];
    return (data || [])
      .filter((t) => !['inactive', 'resigned'].includes(t.status))
      .map((t) => ({
        id: `${code}:${t.id}`,           // id unik lintas-brand (id numerik bisa sama antar brand)
        brand: code,
        brandLabel: BRAND_LABEL[code] || code,
        name: (t.nickname || t.full_name || '').trim(),
        phone: (t.phone || t.whatsapp || '').trim(),
        subtype: t.tl_subtype || '',
      }))
      .filter((t) => t.name && t.phone);
  } catch { return []; }
}

// Daftar TL GABUNGAN (TEONE + Khasanah) + no HP. Dedup by nomor HP (normalisasi angka).
export async function getTlBlastList() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/tl-blast'); if (g.error) return { error: g.error };

  const perBrand = await Promise.all(BRAND_CODES.map((c) => pullTlsForBrand(c)));
  const merged = [];
  const seenPhone = new Set();
  for (const list of perBrand) {
    for (const t of list) {
      const key = t.phone.replace(/\D/g, '').replace(/^0/, '62');
      if (key && seenPhone.has(key)) continue;   // TL sama (nomor sama) di 2 brand → 1x saja
      if (key) seenPhone.add(key);
      merged.push(t);
    }
  }
  merged.sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, tls: merged, sender: 'CS TravelingEropa' };
}

// Kirim blast ke semua / sebagian TL (selectedIds) dari nomor CS TravelingEropa.
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

  let sent = 0, failed = 0;
  const failedNames = [];
  for (const tl of pool) {
    const firstName = tl.name.split(/\s+/)[0] || 'Kak';
    const personalized = msg
      .replace(/\{\{\s*nama\s*\}\}/gi, firstName)
      .replace(/\{\{\s*phone\s*\}\}/gi, tl.phone);
    let ok = false;
    try {
      // Pengirim SELALU nomor CS TravelingEropa (brand TEONE), walau TL-nya dari Khasanah.
      const res = await sendFonnte(tl.phone, personalized, {
        context: SENDER_CONTEXT, brand: SENDER_BRAND,
        delay: BLAST_DELAY, typing: true, kind: 'blast-tl',
      });
      ok = !!res?.ok;
    } catch { ok = false; }
    if (ok) sent++; else { failed++; failedNames.push(tl.name); }
  }

  return { ok: true, sent, failed, total: pool.length, failedNames: failedNames.slice(0, 20) };
}
