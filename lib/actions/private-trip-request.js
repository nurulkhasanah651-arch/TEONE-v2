'use server';

// R224: Private Trip Request — actions
// Public form submit (anon) + internal team management (auth)
// Path: lib/actions/private-trip-request.js

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ============================================================
// PUBLIC: submit request (anon allowed)
// ============================================================
export async function submitPrivateTripRequest(formData) {
  const supabase = getServiceClient() || createClient();

  // Honeypot — bot biasanya isi field hidden ini
  const honeypot = formData.get('website_url');
  if (honeypot) {
    // Pretend success but don't insert
    return { ok: true, fake: true };
  }

  const name = String(formData.get('name') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const email = String(formData.get('email') || '').trim() || null;
  const destination = String(formData.get('destination') || '').trim();
  const trip_type = String(formData.get('trip_type') || '').trim() || null;
  const pax_count = parseInt(formData.get('pax_count')) || 1;
  const start_date = formData.get('start_date') || null;
  const end_date = formData.get('end_date') || null;
  const accommodation_type = String(formData.get('accommodation_type') || '').trim() || null;
  const estimate_budget = parseInt(String(formData.get('estimate_budget') || '').replace(/\D/g, '')) || null;
  const budget_type = formData.get('budget_type') || 'per_pax';
  const itinerary_idea = String(formData.get('itinerary_idea') || '').trim() || null;
  const special_request = String(formData.get('special_request') || '').trim() || null;
  const utm_source = formData.get('utm_source') || null;
  const utm_medium = formData.get('utm_medium') || null;
  const utm_campaign = formData.get('utm_campaign') || null;

  // Validation
  if (!name || name.length < 2) return { error: 'Nama minimal 2 huruf' };
  if (!phone || phone.length < 8) return { error: 'No HP/WA tidak valid' };
  if (!destination) return { error: 'Destinasi tujuan wajib diisi' };
  if (pax_count < 1 || pax_count > 100) return { error: 'Jumlah peserta tidak valid (1-100)' };

  // Get IP + user agent
  let ip_address = null;
  let user_agent = null;
  try {
    const h = headers();
    ip_address = h.get('x-forwarded-for') || h.get('x-real-ip') || null;
    user_agent = h.get('user-agent') || null;
  } catch {}

  // Calc duration
  let duration_days = null;
  if (start_date && end_date) {
    try {
      const days = Math.ceil((new Date(end_date) - new Date(start_date)) / 86400000) + 1;
      duration_days = days > 0 ? days : null;
    } catch {}
  }

  const { data, error } = await supabase
    .from('private_trip_requests')
    .insert({
      name, phone, email,
      destination, trip_type, pax_count,
      start_date, end_date, duration_days,
      accommodation_type, estimate_budget, budget_type,
      itinerary_idea, special_request,
      utm_source, utm_medium, utm_campaign,
      ip_address, user_agent,
      status: 'new',
    })
    .select()
    .single();

  if (error) {
    console.error('[submitPrivateTripRequest]', error);
    return { error: 'Gagal submit request. Coba lagi atau hubungi kami via WhatsApp.' };
  }

  revalidatePath('/private-trips');
  return { ok: true, id: data.id };
}

// ============================================================
// AUTH: list requests with filter
// ============================================================
export async function listPrivateTripRequests({ status = null, search = '', limit = 100 } = {}) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  let q = supabase
    .from('private_trip_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status && status !== 'all') q = q.eq('status', status);
  if (search) q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%,destination.ilike.%${search}%`);

  const { data, error } = await q;
  if (error) return { error: error.message };
  return { ok: true, requests: data || [] };
}

// ============================================================
// AUTH: update status / assign / notes
// ============================================================
export async function updatePrivateTripRequest(id, updates) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  const payload = { ...updates };

  // Auto-set timestamps
  if (updates.status === 'contacted' && !updates.contacted_at) payload.contacted_at = new Date().toISOString();
  if (updates.status === 'quoted' && !updates.quoted_at) payload.quoted_at = new Date().toISOString();
  if (['accepted', 'declined', 'archived'].includes(updates.status) && !updates.closed_at) {
    payload.closed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('private_trip_requests')
    .update(payload)
    .eq('id', id);

  if (error) return { error: error.message };
  revalidatePath('/private-trips');
  revalidatePath(`/private-trips/${id}`);
  return { ok: true };
}

// ============================================================
// AUTH: add quick reply
// ============================================================
export async function addQuickReply(id, replyText) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  if (!replyText || !replyText.trim()) return { error: 'Reply gak boleh kosong' };

  const { data: row } = await supabase
    .from('private_trip_requests')
    .select('quick_replies, status, contacted_at')
    .eq('id', id)
    .maybeSingle();
  if (!row) return { error: 'Request gak ketemu' };

  const replies = Array.isArray(row.quick_replies) ? row.quick_replies : [];
  replies.push({
    text: replyText.trim(),
    by: user.email || 'unknown',
    at: new Date().toISOString(),
  });

  const updates = { quick_replies: replies };
  // Auto-mark contacted kalo masih new
  if (row.status === 'new') {
    updates.status = 'contacted';
    updates.contacted_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('private_trip_requests')
    .update(updates)
    .eq('id', id);
  if (error) return { error: error.message };

  revalidatePath(`/private-trips/${id}`);
  return { ok: true };
}

// ============================================================
// AUTH: delete request (archive only — soft delete via status)
// ============================================================
export async function archivePrivateTripRequest(id) {
  return updatePrivateTripRequest(id, { status: 'archived' });
}
