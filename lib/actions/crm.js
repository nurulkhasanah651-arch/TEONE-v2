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
