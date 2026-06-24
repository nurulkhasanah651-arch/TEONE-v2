'use server';

// Asisten AI Analisa Dokumen Visa (Claude opus-4-7).
// ADDITIVE. Membaca dokumen yang diupload peserta (bucket privat) via signed URL,
// menilai terhadap aturan syarat per negara/profil + konteks trip, lalu simpan hasil JSON.

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';
import { logClaudeUsage } from '@/lib/utils/claude-usage';
import { buildRulesText } from '@/lib/utils/visa-doc-rules';
import { revalidatePath } from 'next/cache';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-opus-4-7';
const BUCKET = 'visa-documents';
const MAX_DOCS = 12;

function svc() {
  const u = brandSupabaseUrl(), k = brandServiceRoleKey();
  if (!u || !k) return null;
  return createServiceClient(u, k, { auth: { persistSession: false, autoRefreshToken: false } });
}
function fmtDate(d) { if (!d) return '-'; try { return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }); } catch { return String(d); } }
function isPdf(doc) { return /pdf/i.test(doc.mime_type || '') || /\.pdf$/i.test(doc.file_path || doc.original_name || ''); }

function templateNames(tpl) {
  if (!Array.isArray(tpl)) return [];
  return tpl.map((d) => (typeof d === 'string' ? d : (d?.name || d?.label || ''))).filter(Boolean);
}

// occupation hint dari jawaban form (jika ada)
async function occupationHint(db, passengerId) {
  try {
    const { data } = await db.from('visa_form_responses').select('data').eq('passenger_id', passengerId).limit(1).maybeSingle();
    const d = data?.data || {};
    return [d.jenis_pekerjaan, d.status_pekerjaan, d.status, d.perusahaan, d.jabatan].filter(Boolean).join(' ');
  } catch { return ''; }
}

async function runAnalysis(db, passengerId) {
  const { data: pax } = await db.from('trip_passengers')
    .select('id, trip_id, customer_id, visa_uploaded_docs, visa_form_type').eq('id', passengerId).maybeSingle();
  if (!pax) return { error: 'Peserta tidak ditemukan' };

  const docs = Array.isArray(pax.visa_uploaded_docs) ? pax.visa_uploaded_docs.filter((d) => d?.file_path) : [];
  if (!docs.length) return { error: 'Belum ada dokumen diupload untuk peserta ini' };

  const [{ data: trip }, { data: cust }] = await Promise.all([
    db.from('trips').select('name, kode_trip, visa_country, departure, return_date, visa_min_balance, visa_doc_template, visa_doc_rules').eq('id', pax.trip_id).maybeSingle(),
    db.from('customers').select('name').eq('id', pax.customer_id).maybeSingle(),
  ]);
  const occ = await occupationHint(db, passengerId);

  // signed URLs (sebagian dok)
  const blocks = [];
  const usedNames = [];
  for (const d of docs.slice(0, MAX_DOCS)) {
    const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(d.file_path, 600);
    if (!signed?.signedUrl) continue;
    usedNames.push(d.doc_name || d.original_name || 'Dokumen');
    blocks.push({ type: 'text', text: `=== Dokumen: ${d.doc_name || d.original_name || 'Dokumen'} ===` });
    blocks.push(isPdf(d)
      ? { type: 'document', source: { type: 'url', url: signed.signedUrl } }
      : { type: 'image', source: { type: 'url', url: signed.signedUrl } });
  }
  if (!blocks.length) return { error: 'Gagal menyiapkan akses file dokumen' };

  const rules = buildRulesText({ visaCountry: trip?.visa_country, formTypeHint: pax.visa_form_type, occupation: occ, customRules: trip?.visa_doc_rules });
  const required = templateNames(trip?.visa_doc_template);
  const minBal = Number(trip?.visa_min_balance) || 0;

  const context = `KONTEKS TRIP:
- Negara visa: ${trip?.visa_country || '(tidak diisi)'}
- Trip: ${trip?.kode_trip || ''} ${trip?.name || ''}
- Tanggal berangkat: ${fmtDate(trip?.departure)}
- Tanggal pulang: ${fmtDate(trip?.return_date)}
- Nama pemohon (sesuai sistem): ${cust?.name || '-'}
- Profil/pekerjaan (petunjuk): ${occ || '(tidak diketahui — simpulkan dari dokumen)'}
${minBal > 0 ? `- Ambang minimal saldo yang diminta tim: Rp ${minBal.toLocaleString('id-ID')}` : '- Ambang saldo: nilai kewajaran berdasarkan durasi & estimasi biaya trip'}

DAFTAR DOKUMEN WAJIB (template): ${required.length ? required.join(', ') : '(tidak diset — nilai berdasarkan aturan negara/profil)'}
DOKUMEN YANG DIUPLOAD: ${usedNames.join(', ')}`;

  const instruction = `Kamu asisten verifikasi dokumen visa untuk travel agent. Analisa SETIAP dokumen yang dilampirkan terhadap ATURAN dan KONTEKS TRIP. Untuk rekening koran, WAJIB analisa cashflow (bukan hanya saldo akhir). Untuk pengusaha, cek legalitas usaha & korelasi omzet di rekening.

Balas HANYA JSON valid (tanpa markdown), Bahasa Indonesia, format:
{
  "ringkasan": "1-2 kalimat status keseluruhan",
  "skor": { "sesuai": 0, "perlu_cek": 0, "tidak_sesuai": 0, "kurang": 0 },
  "per_dokumen": [ { "dokumen": "nama dokumen", "verdict": "sesuai|perlu_cek|tidak_sesuai", "alasan": "alasan singkat & spesifik" } ],
  "kekurangan": [ "nama dokumen wajib yang BELUM diupload" ],
  "saran": [ "tindakan konkret untuk peserta/CS" ]
}`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY belum di-set di Vercel env.' };

  const content = [
    { type: 'text', text: instruction + '\n\n' + rules + '\n\n' + context + '\n\nBerikut dokumen-dokumennya:' },
    ...blocks,
  ];

  let resp;
  try {
    resp = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 2500, messages: [{ role: 'user', content }] }),
    });
  } catch (e) { return { error: 'Gagal hubungi AI: ' + (e?.message || 'unknown') }; }
  if (!resp.ok) { const t = await resp.text(); return { error: `AI error (${resp.status}): ${t.slice(0, 200)}` }; }

  const json = await resp.json();
  try { await logClaudeUsage({ feature: 'visa_doc_analysis', model: CLAUDE_MODEL, usage: json.usage }); } catch {}
  const raw = (json?.content?.[0]?.text || '').replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { error: 'Respon AI bukan JSON valid' }; }

  const analysis = { ...parsed, analyzed_at: new Date().toISOString(), model: CLAUDE_MODEL, docs_count: usedNames.length };
  await db.from('trip_passengers').update({ visa_ai_analysis: analysis, visa_ai_analyzed_at: analysis.analyzed_at }).eq('id', passengerId);
  return { ok: true, analysis, trip_id: pax.trip_id };
}

// ===== STAFF: analisa 1 peserta =====
export async function analyzeVisaDocs(passengerId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const g = await assertStaff(user, '/visa'); if (g.error) return { error: g.error }; }
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  try {
    const r = await runAnalysis(db, passengerId);
    if (r?.ok && r.trip_id) { try { revalidatePath(`/visa/${r.trip_id}`); } catch {} }
    return r;
  } catch (e) { return { error: 'Gagal analisa: ' + (e?.message || 'unknown') }; }
}

// ===== STAFF: analisa semua peserta yg sudah upload =====
export async function analyzeVisaDocsBulk(tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const g = await assertStaff(user, '/visa'); if (g.error) return { error: g.error }; }
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };

  const { data: pax } = await db.from('trip_passengers').select('id, visa_uploaded_docs').eq('trip_id', tripId);
  const targets = (pax || []).filter((p) => Array.isArray(p.visa_uploaded_docs) && p.visa_uploaded_docs.some((d) => d?.file_path));
  let done = 0, failed = 0; const errors = [];
  for (const p of targets) {
    try { const r = await runAnalysis(db, p.id); if (r?.ok) done++; else { failed++; if (r?.error) errors.push(r.error); } }
    catch (e) { failed++; errors.push(e?.message || 'err'); }
  }
  try { revalidatePath(`/visa/${tripId}`); } catch {}
  return { ok: true, done, failed, total: targets.length, message: `🤖 ${done} peserta dianalisa${failed ? ` · ${failed} gagal` : ''}`, errors };
}

// ===== Internal: dipakai auto-trigger saat peserta upload (tanpa auth staf) =====
export async function autoAnalyzeAfterUpload(passengerId) {
  const db = svc(); if (!db) return { skipped: true };
  try {
    // Debounce: jangan analisa ulang bila baru saja dianalisa (< 60 detik)
    const { data: p } = await db.from('trip_passengers').select('visa_ai_analyzed_at').eq('id', passengerId).maybeSingle();
    if (p?.visa_ai_analyzed_at && (Date.now() - new Date(p.visa_ai_analyzed_at).getTime()) < 60000) return { skipped: 'recent' };
    return await runAnalysis(db, passengerId);
  } catch (e) { return { error: e?.message }; }
}
