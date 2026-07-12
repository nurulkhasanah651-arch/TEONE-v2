// Helper kirim WABA per-PIC (dipakai di semua alur: penagihan, konfirmasi, tanda
// terima, pengiriman/ongkir, passport AI, visa form). Bukan 'use server' — terima
// supabase client sebagai argumen. KHUSUS Khasanah (wabaConfig null utk TEONE).

import { currentBrandCode } from '@/lib/supabase/service-env';
import { wabaConfig, sendWabaText, normalizeWaPhone } from '@/lib/utils/waba';

// Cari kredensial WABA utk PIC trip ini.
//   key     = employees.waba_api_key (override) ATAU key akun dari env (accountKey)
//   phoneId = employees.waba_phone_id (nomor pengirim PIC ini)
// PIC dianggap aktif WABA hanya kalau punya key sendiri ATAU phone_id.
export async function getPicWabaKey(supabase, tripId, accountKey) {
  try {
    const { data: t } = await supabase.from('trips').select('pic, pic_email').eq('id', tripId).maybeSingle();
    if (!t) return null;
    const email = String(t.pic_email || '').toLowerCase();
    const name = String(t.pic || '').trim();
    const cols = 'waba_api_key, waba_phone_id, full_name';
    let emp = null;
    if (email) { const r = await supabase.from('employees').select(cols).ilike('email', email).maybeSingle(); emp = r.data; }
    if (!emp && name) {
      let r = await supabase.from('employees').select(cols).ilike('full_name', name).maybeSingle(); emp = r.data;
      if (!emp) { r = await supabase.from('employees').select(cols).ilike('nickname', name).maybeSingle(); emp = r.data; }
    }
    if (!emp) return null;
    const ownKey = emp.waba_api_key ? String(emp.waba_api_key).trim() : '';
    const phoneId = emp.waba_phone_id ? String(emp.waba_phone_id).trim() : '';
    const key = ownKey || String(accountKey || '').trim();
    if (!key) return null;
    if (!ownKey && !phoneId) return null; // opt-in: harus ada key sendiri atau phone_id
    return { key, phoneId, pic: emp.full_name || name };
  } catch { return null; }
}

/**
 * Kirim pesan apa pun via WABA untuk PIC trip ini.
 * Balikan { ok:true } terkirim · { ok:false } gagal · null kalau WABA tidak aktif
 * (bukan Khasanah / PIC belum siap) → caller lanjut ke perilaku manual/Fonnte.
 */
export async function trySendWabaForTrip(supabase, tripId, phone, message, opts = {}) {
  try {
    const cfg = wabaConfig();
    if (!cfg || !tripId || !supabase) return null;
    const picKey = await getPicWabaKey(supabase, tripId, cfg.accountKey);
    if (!picKey) return null;
    const r = await sendWabaText({ key: picKey.key, endpoint: cfg.endpoint, phoneId: picKey.phoneId }, phone, message);
    if (r.ok) {
      try {
        await supabase.from('wa_log').insert({
          brand: currentBrandCode(), context: opts.context || 'finance', kind: opts.kind || 'waba',
          trip_id: tripId, target_phone: normalizeWaPhone(phone), message, status: 'sent', sender: picKey.pic,
        });
      } catch {}
      return { ok: true };
    }
    console.error('[WABA gagal kirim]', r.error);
    return { ok: false, error: r.error };
  } catch (e) {
    console.error('[trySendWabaForTrip]', e?.message);
    return null;
  }
}
