'use server';

// Round 163: Quotation actions — + Template Library + Image Upload
// Path: lib/actions/quotations.js

import { revalidatePath } from 'next/cache';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { logClaudeUsage } from '@/lib/utils/claude-usage';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-opus-4-7';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function randomToken(len = 12) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function createQuotation(formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const created_by = user.user_metadata?.full_name || user.email || 'unknown';

  const payload = {
    title: (formData.get('title') || 'Untitled Quotation').trim(),
    tagline: (formData.get('tagline') || '').trim() || null,
    destinations: (formData.get('destinations') || '').trim() || null,
    duration_days: parseInt(formData.get('duration_days')) || null,
    departure_date: formData.get('departure_date') || null,
    return_date: formData.get('return_date') || null,
    category: formData.get('category') || 'international',
    pax_count: parseInt(formData.get('pax_count')) || 0,
    public_token: randomToken(12),
    created_by,
  };

  // R163: kalau create dari template, copy data template
  const fromTemplateId = formData.get('from_template_id');
  if (fromTemplateId) {
    const { data: tmpl } = await supabase
      .from('trip_quotations')
      .select('*')
      .eq('id', fromTemplateId)
      .eq('is_template', true)
      .maybeSingle();
    if (tmpl) {
      // Copy everything kecuali identity fields
      payload.subtitle = tmpl.subtitle;
      payload.tagline = payload.tagline || tmpl.tagline;
      payload.description = tmpl.description;
      payload.price_options = tmpl.price_options;
      payload.dp_amount = tmpl.dp_amount;
      payload.payment_term = tmpl.payment_term;
      payload.hero_image_url = tmpl.hero_image_url;
      payload.brand_color = tmpl.brand_color;
      payload.agency_logo_url = tmpl.agency_logo_url;
      payload.highlights = tmpl.highlights;
      payload.itinerary = tmpl.itinerary;
      payload.inclusions = tmpl.inclusions;
      payload.exclusions = tmpl.exclusions;
      payload.payment_schedule = tmpl.payment_schedule;
      payload.visa_requirements = tmpl.visa_requirements;
      payload.notes = tmpl.notes;
      payload.bank_info = tmpl.bank_info;
      payload.contact_name = tmpl.contact_name;
      payload.contact_wa = tmpl.contact_wa;
      payload.contact_email = tmpl.contact_email;
      payload.show_visa_requirements = tmpl.show_visa_requirements;
      payload.show_terms = tmpl.show_terms;
    }
  }

  // Buat penawaran langsung dari Private Trip Request
  const fromRequestId = formData.get('from_request_id');
  let _reqRow = null;
  if (fromRequestId) {
    const { data: req } = await supabase
      .from('private_trip_requests').select('*').eq('id', fromRequestId).maybeSingle();
    if (req) {
      _reqRow = req;
      payload.source_request_id = req.id;
      payload.title = payload.title === 'Untitled Quotation'
        ? `Penawaran ${req.destination || ''} — ${req.name || ''}`.trim() : payload.title;
      payload.destinations = payload.destinations || req.destination || null;
      payload.pax_count = payload.pax_count || req.pax_count || 0;
      payload.duration_days = payload.duration_days || req.duration_days || null;
      payload.departure_date = payload.departure_date || req.start_date || null;
      payload.return_date = payload.return_date || req.end_date || null;
      payload.contact_name = req.name || null;
      payload.contact_wa = req.phone || null;
      payload.contact_email = req.email || null;
    }
  }

  const { data, error } = await supabase
    .from('trip_quotations')
    .insert(payload)
    .select('id')
    .single();

  if (error) return { error: error.message };

  // Tandai request sudah dibuatkan penawaran
  if (_reqRow) {
    try {
      await supabase.from('private_trip_requests')
        .update({ status: 'quoted', quoted_at: new Date().toISOString() })
        .eq('id', _reqRow.id);
    } catch {}
  }

  revalidatePath('/quotations');
  redirect(`/quotations/${data.id}/edit`);
}

export async function updateQuotation(id, formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  function parseJSONField(name, fallback) {
    const raw = formData.get(name);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  const payload = {
    title: (formData.get('title') || '').trim(),
    subtitle: (formData.get('subtitle') || '').trim() || null,
    tagline: (formData.get('tagline') || '').trim() || null,
    destinations: (formData.get('destinations') || '').trim() || null,
    duration_days: parseInt(formData.get('duration_days')) || null,
    departure_date: formData.get('departure_date') || null,
    return_date: formData.get('return_date') || null,
    category: formData.get('category') || 'international',
    pax_count: parseInt(formData.get('pax_count')) || 0,
    dp_amount: parseInt(formData.get('dp_amount')) || 0,
    payment_term: (formData.get('payment_term') || '').trim() || null,
    hero_image_url: (formData.get('hero_image_url') || '').trim() || null,
    brand_color: (formData.get('brand_color') || '#1e3a8a').trim(),
    agency_logo_url: (formData.get('agency_logo_url') || '').trim() || null,
    description: (formData.get('description') || '').trim() || null,
    notes: (formData.get('notes') || '').trim() || null,
    bank_info: (formData.get('bank_info') || '').trim() || null,
    contact_name: (formData.get('contact_name') || '').trim() || null,
    contact_wa: (formData.get('contact_wa') || '').trim() || null,
    contact_email: (formData.get('contact_email') || '').trim() || null,
    show_visa_requirements: formData.get('show_visa_requirements') === '1',
    show_terms: formData.get('show_terms') === '1',
    price_options: parseJSONField('price_options', []),
    highlights: parseJSONField('highlights', []),
    itinerary: parseJSONField('itinerary', []),
    inclusions: parseJSONField('inclusions', []),
    exclusions: parseJSONField('exclusions', []),
    payment_schedule: parseJSONField('payment_schedule', []),
    visa_requirements: parseJSONField('visa_requirements', []),
  };

  // Perhitungan biaya/estimasi profit (opsional)
  if (formData.has('cost_breakdown')) {
    payload.cost_breakdown = parseJSONField('cost_breakdown', []);
    payload.cost_mode = formData.get('cost_mode') || 'per_pax';
    payload.selling_price_for_calc = parseInt(String(formData.get('selling_price_for_calc') || '').replace(/\D/g, '')) || null;
  }

  let { error } = await supabase
    .from('trip_quotations')
    .update(payload)
    .eq('id', id);

  if (error && /(subtitle|payment_schedule|visa_requirements|bank_info|show_visa_requirements|show_terms|cost_breakdown|cost_mode|selling_price_for_calc)/.test(error.message)) {
    const stripped = { ...payload };
    delete stripped.subtitle;
    delete stripped.payment_schedule;
    delete stripped.visa_requirements;
    delete stripped.bank_info;
    delete stripped.show_visa_requirements;
    delete stripped.show_terms;
    delete stripped.cost_breakdown;
    delete stripped.cost_mode;
    delete stripped.selling_price_for_calc;
    const retry = await supabase.from('trip_quotations').update(stripped).eq('id', id);
    error = retry.error;
  }

  if (error) return { error: error.message };

  revalidatePath(`/quotations/${id}/edit`);
  revalidatePath(`/quotations/${id}/preview`);
  revalidatePath('/quotations');
  return { ok: true };
}

export async function deleteQuotation(id) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const { error } = await supabase.from('trip_quotations').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/quotations');
  return { ok: true };
}

export async function togglePublish(id, publish) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const { error } = await supabase
    .from('trip_quotations')
    .update({ is_published: !!publish })
    .eq('id', id);
  if (error) return { error: error.message };
  revalidatePath(`/quotations/${id}/edit`);
  revalidatePath('/quotations');
  return { ok: true };
}

// === R163: SAVE AS TEMPLATE ===
export async function saveAsTemplate(id, templateName, templateDescription) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!templateName || !templateName.trim()) {
    return { error: 'Nama template harus diisi' };
  }

  const supabase = getServiceClient() || authClient;

  // Get original
  const { data: original } = await supabase.from('trip_quotations').select('*').eq('id', id).maybeSingle();
  if (!original) return { error: 'Quotation not found' };

  // Create template copy
  const tmpl = { ...original };
  delete tmpl.id;
  delete tmpl.created_at;
  delete tmpl.updated_at;
  tmpl.title = templateName.trim();
  tmpl.is_template = true;
  tmpl.template_name = templateName.trim();
  tmpl.template_description = templateDescription || null;
  tmpl.is_published = false;
  tmpl.public_token = randomToken(12);
  tmpl.view_count = 0;
  tmpl.departure_date = null;
  tmpl.return_date = null;
  tmpl.created_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { data, error } = await supabase
    .from('trip_quotations')
    .insert(tmpl)
    .select('id')
    .single();

  if (error) return { error: error.message };

  revalidatePath('/quotations');
  revalidatePath('/quotations/templates');
  return { ok: true, template_id: data.id };
}

// === R163: LIST TEMPLATES ===
export async function listTemplates() {
  const authClient = createClient();
  const supabase = getServiceClient() || authClient;
  const { data } = await supabase
    .from('trip_quotations')
    .select('id, title, template_name, template_description, category, duration_days, destinations, hero_image_url, brand_color, created_at')
    .eq('is_template', true)
    .order('template_name');
  return data || [];
}

// === R163: DELETE TEMPLATE ===
export async function deleteTemplate(id) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const { error } = await supabase
    .from('trip_quotations')
    .delete()
    .eq('id', id)
    .eq('is_template', true);

  if (error) return { error: error.message };

  revalidatePath('/quotations');
  revalidatePath('/quotations/templates');
  return { ok: true };
}

// === R163: UPLOAD IMAGE TO SUPABASE STORAGE ===
export async function uploadQuotationImage(formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const file = formData.get('file');
  if (!file || typeof file === 'string') return { error: 'No file uploaded' };

  // Validate
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return { error: `File terlalu besar (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 10MB.` };
  }

  const supabase = getServiceClient() || authClient;
  const fileExt = file.name.split('.').pop().toLowerCase();
  const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
  if (!allowedExts.includes(fileExt)) {
    return { error: 'Format harus JPG/PNG/WebP/GIF' };
  }

  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const filename = `${timestamp}-${random}.${fileExt}`;
  const path = `${user.id}/${filename}`;

  const { data, error } = await supabase.storage
    .from('quotation-images')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });

  if (error) return { error: 'Upload gagal: ' + error.message };

  // Get public URL
  const { data: pub } = supabase.storage
    .from('quotation-images')
    .getPublicUrl(data.path);

  return { ok: true, url: pub.publicUrl, path: data.path };
}

// === R163: DELETE IMAGE FROM STORAGE ===
export async function deleteQuotationImage(path) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const { error } = await supabase.storage
    .from('quotation-images')
    .remove([path]);

  if (error) return { error: error.message };
  return { ok: true };
}

export async function regenerateToken(id) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const newToken = randomToken(12);
  const { error } = await supabase
    .from('trip_quotations')
    .update({ public_token: newToken })
    .eq('id', id);
  if (error) return { error: error.message };
  revalidatePath(`/quotations/${id}/edit`);
  return { ok: true, token: newToken };
}

export async function generateAIContent(input) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY belum di-set di Vercel env vars' };

  const { title = '', destinations = '', duration_days = 0, departure_date = '', category = 'international', pax_count = 0, price_range = '' } = input || {};
  if (!destinations && !title) return { error: 'Minimal isi destinations atau title dulu' };

  const prompt = `Kamu adalah travel writer profesional untuk PT. Khasanah Global Internasional (TravelingEropa).
Buatkan konten penawaran trip LENGKAP dalam format JSON valid berdasarkan info:

Title: ${title}
Destinasi: ${destinations}
Durasi: ${duration_days} hari
Tanggal Keberangkatan: ${departure_date || '(belum di-set)'}
Kategori: ${category}
Estimasi Peserta: ${pax_count || '(tidak ditentukan)'}
${price_range ? `Range Harga: ${price_range}` : ''}

Output JSON object dengan struktur:
{
  "tagline": "1 kalimat marketing max 80 karakter",
  "description": "Marketing copy 2-3 paragraf",
  "highlights": [{"icon":"✈","text":"..."}],
  "itinerary": [{"day":1,"title":"Hari 1 - ...","activities":["...","..."]}],
  "inclusions": ["..."],
  "exclusions": ["..."],
  "visa_requirements": ["..."]
}

ATURAN PENTING:
1. Itinerary HARUS tepat ${duration_days} hari
2. Pakai gaya TravelingEropa: ringkas, padat, aktivitas konkret
3. Each day "activities" 3-5 item
4. visa_requirements spesifik per destinasi (Eropa Schengen, Canada eTA, USA, UK, Australia, Japan, Korea, Umroh)
5. Untuk free visa countries (Singapore, Malaysia, Thailand): output visa_requirements: []
6. JANGAN markdown — HANYA JSON object pure

Output hanya JSON object, tanpa teks lain.`;

  try {
    const res = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 6000, messages: [{ role: 'user', content: prompt }] }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { error: `Claude API error (${res.status}): ${errText.slice(0, 200)}` };
    }
    const data = await res.json();
    try { await logClaudeUsage({ feature: 'quotation', model: CLAUDE_MODEL, usage: data.usage }); } catch {}
    const text = data.content?.[0]?.text || '';
    let jsonStr = text.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);

    let parsed;
    try { parsed = JSON.parse(jsonStr); }
    catch (e) { return { error: 'AI output bukan JSON valid: ' + e.message }; }

    return {
      ok: true,
      content: {
        tagline: parsed.tagline || '',
        description: parsed.description || '',
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
        itinerary: Array.isArray(parsed.itinerary) ? parsed.itinerary : [],
        inclusions: Array.isArray(parsed.inclusions) ? parsed.inclusions : [],
        exclusions: Array.isArray(parsed.exclusions) ? parsed.exclusions : [],
        visa_requirements: Array.isArray(parsed.visa_requirements) ? parsed.visa_requirements : [],
      },
    };
  } catch (e) {
    return { error: 'Network error: ' + e.message };
  }
}

export async function generateVisaRequirements(input) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY belum di-set' };

  const { destinations = '', category = 'international' } = input || {};
  if (!destinations) return { error: 'Isi destinasi dulu' };

  const prompt = `Kamu adalah konsultan visa untuk travel agency Indonesia.
Buatkan daftar syarat visa LENGKAP untuk WNI yang akan ke destinasi: ${destinations}
Kategori: ${category}

Output JSON array (parseable) berisi syarat visa dalam Bahasa Indonesia.
Aturan:
- Negara butuh visa: array 10-15 syarat lengkap
- Free visa untuk WNI (Singapore, Malaysia, Thailand): output []
- Eropa Schengen: include saldo Rp 50jt/pax
- Canada: eTA free kalau holding visa USA aktif
- USA: biometrik + interview
- UK: saldo Rp 70jt/pax
- Australia: eVisitor / 600
- Umroh: visa Saudi/MOFA

Output HANYA JSON array, tidak ada teks lain.`;

  try {
    const res = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 3000, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) { const errText = await res.text(); return { error: `Claude API error (${res.status}): ${errText.slice(0, 200)}` }; }
    const data = await res.json();
    try { await logClaudeUsage({ feature: 'quotation', model: CLAUDE_MODEL, usage: data.usage }); } catch {}
    const text = data.content?.[0]?.text || '';
    let jsonStr = text.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
    const firstBracket = jsonStr.indexOf('[');
    const lastBracket = jsonStr.lastIndexOf(']');
    if (firstBracket >= 0 && lastBracket > firstBracket) jsonStr = jsonStr.slice(firstBracket, lastBracket + 1);
    let parsed;
    try { parsed = JSON.parse(jsonStr); }
    catch (e) { return { error: 'AI output bukan JSON valid' }; }
    if (!Array.isArray(parsed)) return { error: 'AI output bukan array' };
    return { ok: true, visa_requirements: parsed };
  } catch (e) {
    return { error: 'Network error: ' + e.message };
  }
}

export async function duplicateQuotation(id) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const { data: original } = await supabase.from('trip_quotations').select('*').eq('id', id).maybeSingle();
  if (!original) return { error: 'Quotation not found' };

  const dup = { ...original };
  delete dup.id;
  delete dup.created_at;
  delete dup.updated_at;
  dup.title = `${original.title} (Copy)`;
  dup.public_token = randomToken(12);
  dup.is_published = false;
  dup.is_template = false; // Copy gak jadi template
  dup.view_count = 0;
  dup.created_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { data, error } = await supabase.from('trip_quotations').insert(dup).select('id').single();
  if (error) return { error: error.message };
  revalidatePath('/quotations');
  redirect(`/quotations/${data.id}/edit`);
}

// ═══════════════ KIRIM PENAWARAN VIA WHATSAPP (FONNTE) ═══════════════
export async function sendQuotationWa(id, overridePhone) {
 try {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const { data: q } = await supabase
    .from('trip_quotations')
    .select('id, title, tagline, public_token, contact_wa, contact_name, is_published')
    .eq('id', id).maybeSingle();
  if (!q) return { error: 'Penawaran tidak ditemukan' };

  const phone = (overridePhone || q.contact_wa || '').trim();
  if (!phone) return { error: 'Nomor WA customer belum diisi di penawaran ini' };
  if (!q.public_token) return { error: 'Penawaran belum punya link publik' };

  // Base URL dari host request (brand aktif)
  let base = '';
  try {
    const { headers } = await import('next/headers');
    const h = headers();
    const host = h.get('host');
    if (host) base = `https://${host}`;
  } catch {}
  if (!base) base = 'https://khasanahtravel.app';
  const link = `${base}/q/${q.public_token}`;

  const greeting = q.contact_name ? `Halo Kak ${q.contact_name},` : 'Halo Kak,';
  const message =
    `${greeting}\n\n` +
    `Berikut penawaran trip dari kami:\n` +
    `*${q.title || 'Penawaran Trip'}*` +
    (q.tagline ? `\n_${q.tagline}_` : '') +
    `\n\nDetail lengkap, harga, itinerary, dan cara pembayaran bisa dilihat di link berikut:\n${link}\n\n` +
    `Silakan dibaca-baca dulu ya Kak, kalau ada yang ingin ditanyakan langsung balas chat ini. Terima kasih 🙏`;

  const { sendFonnte } = await import('@/lib/utils/fonnte');
  const res = await sendFonnte(phone, message, { context: 'finance' });
  if (res.error) return { error: res.error };

  try {
    await supabase.from('trip_quotations')
      .update({ wa_sent_at: new Date().toISOString(), wa_sent_to: phone })
      .eq('id', id);
  } catch {}

  revalidatePath(`/quotations/${id}/edit`);
  return { ok: true, sentTo: phone };
 } catch (e) {
  return { error: 'Gagal kirim WA: ' + (e?.message || 'unknown') };
 }
}

// ═══════════════ SIMPAN PERHITUNGAN BIAYA / ESTIMASI PROFIT ═══════════════
export async function saveQuotationCosts(id, data) {
 try {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const role = user.user_metadata?.role || user.app_metadata?.role || null;
  if (!['owner', 'accounting', 'manager', 'ops'].includes(role)) {
    return { error: 'Hanya owner/accounting/manager/ops yang boleh mengubah perhitungan' };
  }
  const supabase = getServiceClient() || authClient;

  const rows = Array.isArray(data?.cost_breakdown) ? data.cost_breakdown
    .filter((r) => r && (r.label || r.amount))
    .map((r) => ({
      label: String(r.label || '').slice(0, 60),
      amount: parseInt(String(r.amount || 0).toString().replace(/\D/g, '')) || 0,
      per: r.per === 'total' ? 'total' : 'per_pax',
    })) : [];

  const payload = {
    cost_breakdown: rows,
    cost_mode: data?.cost_mode === 'total' ? 'total' : 'per_pax',
    selling_price_for_calc: parseInt(String(data?.selling_price_for_calc || 0).toString().replace(/\D/g, '')) || null,
  };

  let { error } = await supabase.from('trip_quotations').update(payload).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath(`/quotations/${id}/edit`);
  return { ok: true };
 } catch (e) {
  return { error: 'Gagal menyimpan perhitungan: ' + (e?.message || 'unknown') };
 }
}
