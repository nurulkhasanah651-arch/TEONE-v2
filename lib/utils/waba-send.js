// Helper kirim WABA per-PIC untuk alur finance (penagihan, konfirmasi, tanda terima,
// ongkir, passport, visa). Bukan 'use server' — terima supabase client sebagai argumen.
// KHUSUS Khasanah.
//
// Provider: Meta WhatsApp Cloud API LANGSUNG (menggantikan Api.co.id).
//   - Aktif kalau env META_WABA_TOKEN_KHASANAH di-set DAN PIC trip punya nomor
//     terdaftar di wa_numbers (pic_employee_id).
//   - Kalau tidak aktif / gagal -> balikan null  → caller lanjut ke manual / Fonnte.
// Signature fungsi TIDAK berubah, jadi semua caller finance tetap sama (fallback utuh).

import { currentBrandCode } from '@/lib/supabase/service-env';
import { metaConfig, sendMetaText, sendMetaTemplate, normalizeWaPhone } from '@/lib/utils/waba-meta';

// Nomor Meta pengirim milik PIC trip ini (dari wa_numbers).
async function getPicMetaNumber(supabase, tripId) {
  try {
    const { data: t } = await supabase.from('trips').select('pic, pic_email').eq('id', tripId).maybeSingle();
    if (!t) return null;
    const email = String(t.pic_email || '').toLowerCase();
    const name = String(t.pic || '').trim();
    let emp = null;
    if (email) { const r = await supabase.from('employees').select('id, full_name').ilike('email', email).maybeSingle(); emp = r.data; }
    if (!emp && name) {
      let r = await supabase.from('employees').select('id, full_name').ilike('full_name', name).maybeSingle(); emp = r.data;
      if (!emp) { r = await supabase.from('employees').select('id, full_name').ilike('nickname', name).maybeSingle(); emp = r.data; }
    }
    if (!emp) return null;
    const { data: num } = await supabase.from('wa_numbers').select('id, phone_number_id, pic_name').eq('pic_employee_id', emp.id).eq('active', true).maybeSingle();
    if (!num?.phone_number_id) return null;
    return { numberRowId: num.id, phoneNumberId: num.phone_number_id, pic: num.pic_name || emp.full_name || name, empId: emp.id };
  } catch { return null; }
}

// Catat pesan KELUAR ke thread inbox (upsert conversation + insert message).
export async function logOutbound(supabase, { phoneNumberId, numberRowId, toPhone, body, templateName, wamid, sentBy }) {
  try {
    const phone = normalizeWaPhone(toPhone);
    if (!phoneNumberId || !phone) return;
    const preview = (templateName ? `[template] ${templateName}` : String(body || '')).slice(0, 120);
    const now = new Date().toISOString();
    let { data: conv } = await supabase.from('wa_conversations')
      .select('id').eq('phone_number_id', phoneNumberId).eq('customer_phone', phone).maybeSingle();
    if (!conv) {
      const ins = await supabase.from('wa_conversations').insert({
        brand: currentBrandCode(), number_id: numberRowId || null, phone_number_id: phoneNumberId,
        customer_phone: phone, status: 'open', last_message_at: now, last_message_preview: preview,
      }).select('id').maybeSingle();
      conv = ins.data;
    } else {
      await supabase.from('wa_conversations').update({ last_message_at: now, last_message_preview: preview }).eq('id', conv.id);
    }
    if (conv?.id) {
      await supabase.from('wa_messages').insert({
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
    const cfg = metaConfig();
    console.log('[WABA teks] trip=' + tripId + ' metaCfg=' + !!cfg);
    if (!cfg) return null;
    const num = await getPicMetaNumber(supabase, tripId);
    console.log('[WABA teks] picNumber=' + (num ? num.phoneNumberId : 'NULL'));
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
    const cfg = metaConfig();
    console.log('[WABA tpl] trip=' + tripId + ' metaCfg=' + !!cfg + ' tpl=' + templateName);
    if (!cfg) return null;
    const num = await getPicMetaNumber(supabase, tripId);
    console.log('[WABA tpl] picNumber=' + (num ? num.phoneNumberId : 'NULL'));
    if (!num) return null;
    const r = await sendMetaTemplate(cfg, num.phoneNumberId, phone, templateName, cfg.lang, params);
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
