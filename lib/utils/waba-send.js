// Helper kirim WABA per-PIC untuk alur finance (penagihan, konfirmasi, tanda terima,
// ongkir, passport, visa). Bukan 'use server' — terima supabase client sebagai argumen.
// KHUSUS Khasanah.
//
// Provider: Meta WhatsApp Cloud API LANGSUNG (menggantikan Api.co.id).
//   - Aktif kalau env META_WABA_TOKEN_KHASANAH di-set DAN PIC trip punya nomor
//     terdaftar di wa_numbers (pic_employee_id).
//   - Kalau tidak aktif / gagal -> balikan null  → caller lanjut ke manual / Fonnte.
// Signature fungsi TIDAK berubah, jadi semua caller finance tetap sama (fallback utuh).

import { currentBrandCode, brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient as _createSvc } from '@supabase/supabase-js';
import { metaConfig, sendMetaText, sendMetaTemplate, normalizeWaPhone } from '@/lib/utils/waba-meta';
import { apicoidConfig, sendApicoidText, sendApicoidTemplate } from '@/lib/utils/waba-apicoid';

// Service client sendiri — tabel wa_numbers/wa_conversations/wa_messages/employees
// pakai RLS, sedangkan caller finance kadang kirim client sesi. Pakai service role
// biar lookup nomor & log inbox tidak keblok RLS.
function svc(fallback) {
  try {
    const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
    if (url && key) return _createSvc(url, key, { auth: { persistSession: false } });
  } catch {}
  return fallback;
}

// Nomor Api.co.id pengirim milik PIC trip ini (employees.waba_phone_id = id Api.co.id).
async function getPicApicoidPhone(supabase, tripId) {
  try {
    const db = svc(supabase);
    const { data: t } = await db.from('trips').select('pic, pic_email').eq('id', tripId).maybeSingle();
    if (!t) return null;
    const email = String(t.pic_email || '').toLowerCase();
    const name = String(t.pic || '').trim();
    const cols = 'waba_phone_id, full_name, waba_tpl_invoice, waba_tpl_konfirmasi, waba_tpl_paspor, waba_tpl_ongkir, waba_tpl_pengiriman';
    let emp = null;
    if (email) { const r = await db.from('employees').select(cols).ilike('email', email).maybeSingle(); emp = r.data; }
    if (!emp && name) {
      let r = await db.from('employees').select(cols).ilike('full_name', name).maybeSingle(); emp = r.data;
      if (!emp) { r = await db.from('employees').select(cols).ilike('nickname', name).maybeSingle(); emp = r.data; }
    }
    const phoneId = emp?.waba_phone_id ? String(emp.waba_phone_id).trim() : '';
    if (!phoneId) return null;
    const _t = (v) => (v || '').trim();
    // Nama template per-PIC diisi eksplisit di HR (Api.co.id butuh nama unik per nomor WABA).
    return {
      phoneId, pic: emp.full_name || name,
      tplInvoice: _t(emp.waba_tpl_invoice), tplKonfirmasi: _t(emp.waba_tpl_konfirmasi),
      tplPaspor: _t(emp.waba_tpl_paspor), tplOngkir: _t(emp.waba_tpl_ongkir), tplPengiriman: _t(emp.waba_tpl_pengiriman),
    };
  } catch { return null; }
}

// Nomor Meta pengirim milik PIC trip ini (dari wa_numbers).
async function getPicMetaNumber(supabase, tripId) {
  try {
    const db = svc(supabase);
    const { data: t } = await db.from('trips').select('pic, pic_email').eq('id', tripId).maybeSingle();
    if (!t) return null;
    const email = String(t.pic_email || '').toLowerCase();
    const name = String(t.pic || '').trim();
    let emp = null;
    if (email) { const r = await db.from('employees').select('id, full_name').ilike('email', email).maybeSingle(); emp = r.data; }
    if (!emp && name) {
      let r = await db.from('employees').select('id, full_name').ilike('full_name', name).maybeSingle(); emp = r.data;
      if (!emp) { r = await db.from('employees').select('id, full_name').ilike('nickname', name).maybeSingle(); emp = r.data; }
    }
    if (!emp) return null;
    const { data: num } = await db.from('wa_numbers').select('id, phone_number_id, pic_name').eq('pic_employee_id', emp.id).eq('active', true).maybeSingle();
    if (!num?.phone_number_id) return null;
    return { numberRowId: num.id, phoneNumberId: num.phone_number_id, pic: num.pic_name || emp.full_name || name, empId: emp.id };
  } catch { return null; }
}

// Catat pesan KELUAR ke thread inbox (upsert conversation + insert message).
export async function logOutbound(supabase, { phoneNumberId, numberRowId, toPhone, body, templateName, wamid, sentBy }) {
  try {
    const db = svc(supabase);
    const phone = normalizeWaPhone(toPhone);
    if (!phoneNumberId || !phone) return;
    const preview = (templateName ? `[template] ${templateName}` : String(body || '')).slice(0, 120);
    const now = new Date().toISOString();
    let { data: conv } = await db.from('wa_conversations')
      .select('id, first_reply_at').eq('phone_number_id', phoneNumberId).eq('customer_phone', phone).maybeSingle();
    if (!conv) {
      const ins = await db.from('wa_conversations').insert({
        brand: currentBrandCode(), number_id: numberRowId || null, phone_number_id: phoneNumberId,
        customer_phone: phone, status: 'open', last_message_at: now, last_message_preview: preview, first_reply_at: now,
      }).select('id').maybeSingle();
      conv = ins.data;
    } else {
      await db.from('wa_conversations').update({ last_message_at: now, last_message_preview: preview, ...(conv.first_reply_at ? {} : { first_reply_at: now }) }).eq('id', conv.id);
    }
    if (conv?.id) {
      await db.from('wa_messages').insert({
        brand: currentBrandCode(), conversation_id: conv.id, direction: 'out',
        type: templateName ? 'template' : 'text', body: body || null, template_name: templateName || null,
        wa_message_id: wamid || null, status: 'sent', sent_by: sentBy || null,
      });
    }
  } catch { /* logging best-effort */ }
}

// ---------- Kirim TEKS (dalam 24 jam window) ----------
export async function trySendWabaForTrip(supabase, tripId, phone, message, opts = {}) {
  try {
    if (!tripId || !supabase) return null;
    // 1) Api.co.id (coexistence)
    const acfg = apicoidConfig();
    if (acfg) {
      const ap = await getPicApicoidPhone(supabase, tripId);
      if (ap) {
        const r = await sendApicoidText(acfg, ap.phoneId, phone, message);
        if (r.ok) { await logOutbound(supabase, { phoneNumberId: ap.phoneId, toPhone: phone, body: message, wamid: r.id }); return { ok: true, via: 'apicoid' }; }
        console.error('[Apicoid teks gagal]', r.error);
        return { ok: false, error: r.error };
      }
    }
    // 2) Meta Cloud API (fallback, kalau dipakai)
    const cfg = metaConfig();
    if (!cfg) return null;
    const num = await getPicMetaNumber(supabase, tripId);
    if (!num) return null;
    const r = await sendMetaText(cfg, num.phoneNumberId, phone, message);
    if (r.ok) {
      await logOutbound(supabase, { phoneNumberId: num.phoneNumberId, numberRowId: num.numberRowId, toPhone: phone, body: message, wamid: r.wamid });
      return { ok: true, via: 'meta' };
    }
    console.error('[Meta WABA teks gagal]', r.error);
    return { ok: false, error: r.error };
  } catch (e) {
    console.error('[trySendWabaForTrip]', e?.message);
    return null;
  }
}

// ---------- Kirim TEMPLATE (peserta belum chat / di luar 24 jam) ----------
export async function trySendWabaTemplateForTrip(supabase, tripId, phone, templateName, params, opts = {}) {
  try {
    if (!tripId || !supabase || !templateName) return null;
    // 1) Api.co.id (coexistence)
    const acfg = apicoidConfig();
    if (acfg) {
      const ap = await getPicApicoidPhone(supabase, tripId);
      if (ap) {
        // Nama template bisa beda per PIC (Api.co.id butuh nama unik). Ambil sesuai jenis.
        let tname = templateName;
        const _kind = opts.kind || '';
        if (_kind === 'waba_invoice' && ap.tplInvoice) tname = ap.tplInvoice;
        else if (_kind === 'waba_approval' && ap.tplKonfirmasi) tname = ap.tplKonfirmasi;
        else if (_kind === 'waba_passport' && ap.tplPaspor) tname = ap.tplPaspor;
        else if (_kind === 'waba_ongkir' && ap.tplOngkir) tname = ap.tplOngkir;
        else if (_kind === 'waba_pengiriman' && ap.tplPengiriman) tname = ap.tplPengiriman;
        const r = await sendApicoidTemplate(acfg, ap.phoneId, phone, tname, acfg.lang, params, opts.buttonUrlSuffix);
        if (r.ok) { await logOutbound(supabase, { phoneNumberId: ap.phoneId, toPhone: phone, templateName: tname, wamid: r.id }); return { ok: true, via: 'apicoid' }; }
        console.error('[Apicoid template gagal]', tname, r.error);
        return { ok: false, error: r.error };
      }
    }
    // 2) Meta Cloud API (fallback)
    const cfg = metaConfig();
    if (!cfg) return null;
    const num = await getPicMetaNumber(supabase, tripId);
    if (!num) return null;
    const r = await sendMetaTemplate(cfg, num.phoneNumberId, phone, templateName, cfg.lang, params, opts.buttonUrlSuffix);
    if (r.ok) {
      await logOutbound(supabase, { phoneNumberId: num.phoneNumberId, numberRowId: num.numberRowId, toPhone: phone, templateName, wamid: r.wamid });
      return { ok: true, via: 'meta' };
    }
    console.error('[Meta WABA template gagal]', r.error);
    return { ok: false, error: r.error };
  } catch (e) {
    console.error('[trySendWabaTemplateForTrip]', e?.message);
    return null;
  }
}
