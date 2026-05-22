'use server';

// Portal TL server actions — Round 68: petty cash sync ke HPP + reconciliation

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// ============ CHECKLIST ============
export async function updateTlChecklist(tripId, checklist) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  if (!Array.isArray(checklist)) return { error: 'Format invalid' };
  const { error } = await supabase.from('trips').update({ tl_checklist: checklist }).eq('id', tripId);
  if (error) return { error: error.message };
  revalidatePath(`/tl/${tripId}`);
  return { ok: true };
}

// ============ PETTY CASH — Round 68: hanya Ops/Manager/Owner ============
export async function updateTlPettyCash(tripId, amount) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Role check — TL not allowed
  const role = user.user_metadata?.role;
  if (role === 'tour_leader') {
    return { error: 'TL tidak boleh set petty cash. Hubungi Ops.' };
  }
  if (role === 'cs') {
    return { error: 'CS tidak boleh set petty cash.' };
  }

  const amt = parseInt(amount) || 0;
  const updated_by = user.user_metadata?.full_name || user.email || 'unknown';

  // Get current state
  const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!trip) return { error: 'Trip tidak ditemukan' };

  // Update tl_petty_cash di trips
  const { error } = await supabase.from('trips').update({ tl_petty_cash: amt }).eq('id', tripId);
  if (error) return { error: error.message };

  // Auto-sync ke HPP — buat/update finance item
  if (amt > 0) {
    if (trip.tl_pettycash_hpp_id) {
      // Update existing HPP entry
      await supabase.from('trip_finance_items').update({
        total_amount: amt, basic_fare: amt, qty: 1,
        notes: `Petty cash TL (updated by ${updated_by})`,
      }).eq('id', trip.tl_pettycash_hpp_id);
    } else {
      // Create new HPP entry
      const { data: newItem } = await supabase.from('trip_finance_items').insert({
        trip_id: tripId,
        item_type: 'hpp',
        category: 'Tour Leader',
        component: 'Petty Cash TL',
        vendor_name: trip.tl_name || 'TL',
        basic_fare: amt, qty: 1, total_amount: amt,
        notes: `Petty cash TL (set by ${updated_by})`,
        payment_status: 'lunas',
      }).select().maybeSingle();

      if (newItem?.id) {
        await supabase.from('trips').update({ tl_pettycash_hpp_id: newItem.id }).eq('id', tripId);
      }
    }
  }

  revalidatePath(`/tl/${tripId}`);
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/finance/cashflow/${tripId}`);
  return { ok: true };
}

// ============ EXPENSES ============
export async function addTlExpense(tripId, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const date = formData.get('date') || new Date().toISOString().slice(0, 10);
  const category = (formData.get('category') || '').trim() || null;
  const description = (formData.get('description') || '').trim() || null;
  const amount = parseInt(formData.get('amount')) || 0;
  const photo_url = (formData.get('photo_url') || '').trim() || null;
  if (amount <= 0) return { error: 'Amount harus > 0' };

  const created_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { error } = await supabase.from('tl_expenses').insert({
    trip_id: tripId, date, category, description, amount, photo_url, created_by,
  });
  if (error) return { error: error.message };

  revalidatePath(`/tl/${tripId}`);
  return { ok: true };
}

export async function deleteTlExpense(expenseId, tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const { error } = await supabase.from('tl_expenses').delete().eq('id', expenseId);
  if (error) return { error: error.message };
  revalidatePath(`/tl/${tripId}`);
  return { ok: true };
}

// ============ RECONCILIATION (Round 68) ============
// TL/Ops request reimburse (kalau saldo minus)
export async function requestReimburse(tripId, amount, note) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const amt = parseInt(amount) || 0;
  if (amt <= 0) return { error: 'Amount reimburse harus > 0' };

  const requested_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { error } = await supabase.from('trips').update({
    tl_reimburse_status: 'requested',
    tl_reimburse_amount: amt,
    tl_reimburse_note: `Requested by ${requested_by}${note ? ': ' + note : ''}`,
  }).eq('id', tripId);

  if (error) return { error: error.message };
  revalidatePath(`/tl/${tripId}`);
  revalidatePath(`/trips/${tripId}`);
  return { ok: true };
}

// Finance/Owner approve reimburse → tambah HPP item
export async function approveReimburse(tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const role = user.user_metadata?.role;
  if (!['owner', 'manager', 'ops'].includes(role)) {
    return { error: 'Hanya Owner/Manager/Ops yang bisa approve reimburse.' };
  }

  const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!trip) return { error: 'Trip tidak ditemukan' };
  if (trip.tl_reimburse_status !== 'requested') {
    return { error: 'Status bukan "requested". Tidak bisa approve.' };
  }

  const amt = trip.tl_reimburse_amount || 0;
  const approved_by = user.user_metadata?.full_name || user.email || 'unknown';

  // Tambah HPP item baru "Reimburse TL"
  const { error: hppErr } = await supabase.from('trip_finance_items').insert({
    trip_id: tripId,
    item_type: 'hpp',
    category: 'Tour Leader',
    component: 'Reimburse TL (over budget)',
    vendor_name: trip.tl_name || 'TL',
    basic_fare: amt, qty: 1, total_amount: amt,
    notes: `Reimburse approved by ${approved_by}. ${trip.tl_reimburse_note || ''}`,
    payment_status: 'lunas',
  });

  if (hppErr) return { error: 'Gagal insert HPP: ' + hppErr.message };

  await supabase.from('trips').update({
    tl_reimburse_status: 'approved',
    tl_reconciled_at: new Date().toISOString(),
    tl_reconciled_by: approved_by,
  }).eq('id', tripId);

  revalidatePath(`/tl/${tripId}`);
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/finance/cashflow/${tripId}`);
  return { ok: true };
}

// TL/Ops confirm transfer balik (kalau saldo sisa)
export async function confirmReturnPettyCash(tripId, amount, note) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const amt = parseInt(amount) || 0;
  if (amt <= 0) return { error: 'Amount return harus > 0' };

  const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!trip) return { error: 'Trip tidak ditemukan' };

  const confirmed_by = user.user_metadata?.full_name || user.email || 'unknown';

  // Reduce petty cash HPP — insert negative entry atau credit
  await supabase.from('trip_finance_items').insert({
    trip_id: tripId,
    item_type: 'hpp',
    category: 'Tour Leader',
    component: 'Return Petty Cash (refund)',
    vendor_name: trip.tl_name || 'TL',
    basic_fare: -amt, qty: 1, total_amount: -amt,  // negative → reduce HPP total
    notes: `TL transfer balik sisa petty cash. Confirmed by ${confirmed_by}${note ? ': ' + note : ''}`,
    payment_status: 'lunas',
  });

  await supabase.from('trips').update({
    tl_reimburse_status: 'returned',
    tl_reimburse_amount: amt,
    tl_reimburse_note: `Returned by ${confirmed_by}${note ? ': ' + note : ''}`,
    tl_reconciled_at: new Date().toISOString(),
    tl_reconciled_by: confirmed_by,
  }).eq('id', tripId);

  revalidatePath(`/tl/${tripId}`);
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/finance/cashflow/${tripId}`);
  return { ok: true };
}

// Mark as "no reconciliation needed" (saldo pas)
export async function markReconciledZero(tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const by = user.user_metadata?.full_name || user.email || 'unknown';

  await supabase.from('trips').update({
    tl_reimburse_status: 'no_reconciliation',
    tl_reconciled_at: new Date().toISOString(),
    tl_reconciled_by: by,
  }).eq('id', tripId);

  revalidatePath(`/tl/${tripId}`);
  return { ok: true };
}

// ============ GMAPS REVIEW ============
export async function addGmapsReview(tripId, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const passenger_name = (formData.get('passenger_name') || '').trim() || null;
  const photo_url = (formData.get('photo_url') || '').trim() || null;
  const notes = (formData.get('notes') || '').trim() || null;

  if (!passenger_name && !photo_url) return { error: 'Minimal nama peserta atau link foto wajib' };

  const created_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { error } = await supabase.from('tl_gmaps_reviews').insert({
    trip_id: tripId, passenger_name, photo_url, notes, created_by,
  });
  if (error) return { error: error.message };
  revalidatePath(`/tl/${tripId}`);
  return { ok: true };
}

export async function deleteGmapsReview(reviewId, tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const { error } = await supabase.from('tl_gmaps_reviews').delete().eq('id', reviewId);
  if (error) return { error: error.message };
  revalidatePath(`/tl/${tripId}`);
  return { ok: true };
}

// ============ VENDOR REVIEW ============
export async function addVendorReview(tripId, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const vendor_type = (formData.get('vendor_type') || '').trim() || null;
  const vendor_name = (formData.get('vendor_name') || '').trim() || null;
  const rating = parseInt(formData.get('rating')) || null;
  const notes = (formData.get('notes') || '').trim() || null;

  if (!vendor_name) return { error: 'Nama vendor wajib' };
  if (!rating || rating < 1 || rating > 5) return { error: 'Rating 1-5 wajib' };

  const created_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { error } = await supabase.from('tl_vendor_reviews').insert({
    trip_id: tripId, vendor_type, vendor_name, rating, notes, created_by,
  });
  if (error) return { error: error.message };
  revalidatePath(`/tl/${tripId}`);
  return { ok: true };
}

export async function deleteVendorReview(reviewId, tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const { error } = await supabase.from('tl_vendor_reviews').delete().eq('id', reviewId);
  if (error) return { error: error.message };
  revalidatePath(`/tl/${tripId}`);
  return { ok: true };
}

// ============ DOC LINK ============
export async function updateTlDocLink(tripId, url) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const clean = (url || '').trim() || null;
  const { error } = await supabase.from('trips').update({ tl_doc_link: clean }).eq('id', tripId);
  if (error) return { error: error.message };
  revalidatePath(`/tl/${tripId}`);
  return { ok: true };
}
