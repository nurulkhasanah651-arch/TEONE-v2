'use server';

// CRM — kelola data customer berdasarkan data yang sudah ada.
// total_trips, total_spent, status (lead/new/repeat/vip) di-recompute otomatis
// via trigger dari trip_passengers. Action di sini untuk edit data CRM manual.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function updateCustomerCRM(customerId, fields) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  if (!customerId) return { error: 'customerId kosong' };

  const allowed = ['name', 'phone', 'whatsapp', 'email', 'city', 'address',
    'gender', 'birthday', 'referral_source', 'notes', 'tags',
    'is_blacklisted', 'blacklist_reason'];
  const payload = {};
  for (const k of allowed) {
    if (k in (fields || {})) payload[k] = fields[k] === '' ? null : fields[k];
  }
  if (Array.isArray(payload.tags)) {
    payload.tags = payload.tags.map((t) => String(t).trim()).filter(Boolean);
  }
  payload.updated_at = new Date().toISOString();

  const { error } = await supabase.from('customers').update(payload).eq('id', customerId);
  if (error) return { error: error.message };
  revalidatePath('/crm');
  revalidatePath(`/crm/${customerId}`);
  return { ok: true };
}

export async function getCustomerDetail(customerId) {
  const supabase = createClient();
  if (!customerId) return { error: 'customerId kosong' };
  try {
    const { data: customer } = await supabase.from('customers').select('*').eq('id', customerId).maybeSingle();
    if (!customer) return { error: 'Customer tidak ditemukan' };

    // Riwayat trip dari trip_passengers
    const { data: pax } = await supabase
      .from('trip_passengers')
      .select('id, trip_id, price_paid, room_type, status, refund_status, transfer_status, joined_at')
      .eq('customer_id', customerId);
    const tripIds = [...new Set((pax || []).map((p) => p.trip_id).filter(Boolean))];
    let tripMap = {};
    if (tripIds.length > 0) {
      const { data: trips } = await supabase.from('trips').select('id, name, kode_trip, departure, status').in('id', tripIds);
      tripMap = Object.fromEntries((trips || []).map((t) => [t.id, t]));
    }
    const history = (pax || []).map((p) => ({
      ...p,
      trip: tripMap[p.trip_id] || null,
    })).sort((a, b) => new Date(b.joined_at || 0) - new Date(a.joined_at || 0));

    // Referral: siapa yang direferensikan customer ini
    const { data: referrals } = await supabase
      .from('customers').select('id, name, total_trips').eq('referred_by_customer_id', customerId);

    let referrer = null;
    if (customer.referred_by_customer_id) {
      const { data: r } = await supabase.from('customers').select('id, name').eq('id', customer.referred_by_customer_id).maybeSingle();
      referrer = r;
    }

    return { ok: true, customer, history, referrals: referrals || [], referrer };
  } catch (e) {
    return { error: e?.message || 'gagal' };
  }
}

// ============================================================
// FOLLOW-UP: ulang tahun, paspor expired, broadcast tawarkan trip
// ============================================================
import { sendFonnte, normalizePhone } from '@/lib/utils/fonnte';

export async function getFollowupLists() {
  const supabase = createClient();
  try {
    const { data: list } = await supabase
      .from('customers')
      .select('id, name, phone, whatsapp, birthday, passport_no, passport_number, passport_expiry, status, referral_source, is_blacklisted, total_trips')
      .limit(5000);
    const all = (list || []).filter((c) => !c.is_blacklisted);
    const now = new Date();
    const m = now.getMonth() + 1;
    const in180 = new Date(now.getTime() + 180 * 86400000);

    const birthdays = all.filter((c) => {
      if (!c.birthday) return false;
      try { return (new Date(c.birthday).getMonth() + 1) === m; } catch { return false; }
    }).map((c) => ({ id: c.id, name: c.name, phone: c.phone || c.whatsapp, birthday: c.birthday }));

    const passportExpiring = all.filter((c) => {
      if (!c.passport_expiry) return false;
      try { const d = new Date(c.passport_expiry); return d <= in180; } catch { return false; }
    }).map((c) => ({ id: c.id, name: c.name, phone: c.phone || c.whatsapp, passport_no: c.passport_no || c.passport_number, passport_expiry: c.passport_expiry }))
      .sort((a, b) => new Date(a.passport_expiry) - new Date(b.passport_expiry));

    return { ok: true, birthdays, passportExpiring };
  } catch (e) {
    return { error: e?.message || 'gagal' };
  }
}

// Ambil penerima broadcast sesuai segmen
export async function getBroadcastRecipients({ segment = 'all', source = '' } = {}) {
  const supabase = createClient();
  try {
    let q = supabase.from('customers')
      .select('id, name, phone, whatsapp, status, referral_source, is_blacklisted')
      .eq('is_blacklisted', false);
    if (['lead', 'new', 'repeat', 'vip'].includes(segment)) q = q.eq('status', segment);
    if (source) q = q.eq('referral_source', source);
    const { data } = await q.limit(5000);
    const recipients = (data || [])
      .map((c) => ({ id: c.id, name: c.name, phone: c.phone || c.whatsapp }))
      .filter((c) => c.phone);
    return { ok: true, recipients };
  } catch (e) {
    return { error: e?.message || 'gagal' };
  }
}

// Kirim broadcast WA via Fonnte. message bisa pakai {nama} → diganti nama customer.
export async function sendCrmBroadcast(recipients, message) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  if (!Array.isArray(recipients) || recipients.length === 0) return { error: 'Tidak ada penerima' };
  if (!message || !message.trim()) return { error: 'Pesan kosong' };
  if (recipients.length > 500) return { error: 'Maksimal 500 penerima per broadcast' };

  let sent = 0, failed = 0;
  for (const r of recipients) {
    if (!r.phone) { failed++; continue; }
    const personalized = message.replace(/\{nama\}/gi, r.name || 'Bapak/Ibu');
    try {
      const res = await sendFonnte(normalizePhone(r.phone), personalized, { context: 'finance' });
      if (res?.error) failed++; else sent++;
    } catch { failed++; }
  }
  return { ok: true, sent, failed, total: recipients.length };
}
