'use server';

// Portal TL server actions — checklist, petty cash, expenses, reviews, doc link

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// ============ CHECKLIST ============
export async function updateTlChecklist(tripId, checklist) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!Array.isArray(checklist)) return { error: 'Format invalid' };

  const { error } = await supabase
    .from('trips')
    .update({ tl_checklist: checklist })
    .eq('id', tripId);

  if (error) return { error: error.message };

  revalidatePath(`/tl/${tripId}`);
  return { ok: true };
}

// ============ PETTY CASH (saldo awal) ============
export async function updateTlPettyCash(tripId, amount) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const amt = parseInt(amount) || 0;

  const { error } = await supabase
    .from('trips')
    .update({ tl_petty_cash: amt })
    .eq('id', tripId);

  if (error) return { error: error.message };

  revalidatePath(`/tl/${tripId}`);
  return { ok: true };
}

// ============ EXPENSES (input TL, auto-link accounting) ============
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

  // Insert expense
  const { data: inserted, error } = await supabase
    .from('tl_expenses')
    .insert({ trip_id: tripId, date, category, description, amount, photo_url, created_by })
    .select()
    .maybeSingle();

  if (error) return { error: error.message };

  // Auto-create accounting_entry sebagai cash out
  // Pakai default account (first active bank/cash)
  const { data: accounts } = await supabase.from('accounts').select('id, name, type, active').order('name');
  const activeAccts = (accounts || []).filter((a) => a.active !== false);
  const defaultAcct = activeAccts.find((a) => a.type === 'cash') || activeAccts[0];

  if (defaultAcct && inserted) {
    const { data: trip } = await supabase.from('trips').select('kode_trip, name').eq('id', tripId).maybeSingle();
    const tripLabel = trip?.kode_trip || trip?.name || '';

    const { data: acctEntry } = await supabase.from('accounting_entries').insert({
      type: 'out',
      amount,
      category: 'Petty Cash TL',
      description: `${category || 'Expense'}: ${description || ''}${tripLabel ? ' [' + tripLabel + ']' : ''}`,
      trip_id: tripId,
      account_id: defaultAcct.id,
      date,
      created_by,
    }).select().maybeSingle();

    // Update tl_expenses dengan linked accounting id
    if (acctEntry?.id) {
      await supabase
        .from('tl_expenses')
        .update({ linked_accounting_id: acctEntry.id })
        .eq('id', inserted.id);
    }
  }

  revalidatePath(`/tl/${tripId}`);
  revalidatePath('/accounting');
  return { ok: true };
}

export async function deleteTlExpense(expenseId, tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Ambil dulu linked_accounting_id
  const { data: exp } = await supabase
    .from('tl_expenses')
    .select('linked_accounting_id')
    .eq('id', expenseId)
    .maybeSingle();

  if (exp?.linked_accounting_id) {
    await supabase.from('accounting_entries').delete().eq('id', exp.linked_accounting_id);
  }

  const { error } = await supabase.from('tl_expenses').delete().eq('id', expenseId);
  if (error) return { error: error.message };

  revalidatePath(`/tl/${tripId}`);
  revalidatePath('/accounting');
  return { ok: true };
}

// ============ GMAPS REVIEW (screenshot bukti) ============
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

// ============ VENDOR REVIEW (rating 1-5) ============
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

// ============ DOC LINK (drive folder dokumentasi) ============
export async function updateTlDocLink(tripId, url) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const clean = (url || '').trim() || null;

  const { error } = await supabase
    .from('trips')
    .update({ tl_doc_link: clean })
    .eq('id', tripId);

  if (error) return { error: error.message };

  revalidatePath(`/tl/${tripId}`);
  return { ok: true };
}
