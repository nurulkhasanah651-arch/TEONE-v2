'use server';

// Round 130: TL Expense — auto-route ke Petty Cash atau Reimbursement
// Path: lib/actions/tlexpense.js

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { revalidatePath } from 'next/cache';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Add TL Expense — auto-routing:
 * 1. Cek remaining petty cash
 * 2. Kalau expense ≤ remaining → deduct petty cash full
 * 3. Kalau expense > remaining → petty cash dikurangi sampai 0 + sisa jadi reimbursement
 * 4. Kalau petty cash sudah 0/null → seluruh expense jadi reimbursement request
 */
export async function addTLExpense({
  tripId, category, description, amount, receiptUrl = '', spentAt,
  notes = '', userEmail = '', userName = '', userRole = 'tour_leader',
}) {
  if (!tripId) return { error: 'tripId wajib' };
  if (!description) return { error: 'description wajib' };
  const expenseAmount = Number(amount || 0);
  if (expenseAmount <= 0) return { error: 'amount wajib > 0' };

  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    // 1. Get current petty cash
    const { data: petty } = await supabase
      .from('trip_petty_cash').select('*').eq('trip_id', tripId).maybeSingle();

    const allocated = Number(petty?.allocated_amount || 0);
    const spent = Number(petty?.spent_amount || 0);
    const remaining = Math.max(allocated - spent, 0);

    // 2. Decide routing
    let pettyDeduct = 0;
    let reimbursementAmount = 0;
    let routing = '';

    if (remaining >= expenseAmount) {
      // Petty cash cukup — deduct full
      pettyDeduct = expenseAmount;
      reimbursementAmount = 0;
      routing = 'petty_full';
    } else if (remaining > 0) {
      // Petty cash partial — sisanya jadi reimbursement
      pettyDeduct = remaining;
      reimbursementAmount = expenseAmount - remaining;
      routing = 'petty_partial';
    } else {
      // Petty cash habis/belum diset — full reimbursement
      pettyDeduct = 0;
      reimbursementAmount = expenseAmount;
      routing = 'reimbursement_full';
    }

    const results = { routing, pettyDeduct, reimbursementAmount };

    // 3. Update petty cash spent (kalau ada deduct)
    if (pettyDeduct > 0 && petty) {
      await supabase.from('trip_petty_cash').update({
        spent_amount: spent + pettyDeduct,
        updated_at: new Date().toISOString(),
      }).eq('id', petty.id);
    }

    // 4. Create reimbursement request (kalau ada sisa)
    if (reimbursementAmount > 0) {
      const reimbDesc = pettyDeduct > 0
        ? `${description} (kelebihan ${formatRp(reimbursementAmount)} dari petty cash ${formatRp(remaining)} yang dipakai dari expense ${formatRp(expenseAmount)})`
        : `${description} (petty cash habis/belum diset)`;

      const { data: reimb, error: reimbErr } = await supabase.from('reimbursement_requests').insert({
        trip_id: tripId,
        requester_name: userName,
        requester_email: userEmail,
        requester_role: userRole,
        category,
        description: reimbDesc,
        amount: reimbursementAmount,
        receipt_url: receiptUrl,
        spent_at: spentAt || null,
        notes: notes + (pettyDeduct > 0 ? ` [Auto: petty cash dipakai ${formatRp(pettyDeduct)}, reimburse ${formatRp(reimbursementAmount)}]` : ' [Auto: petty cash habis]'),
        status: 'pending',
      }).select().single();

      if (reimbErr) {
        results.reimbursementError = reimbErr.message;
      } else {
        results.reimbursementId = reimb.id;
      }
    }

    revalidatePath(`/tl/${tripId}`);
    revalidatePath('/tl');

    return {
      ok: true,
      ...results,
      summary: {
        totalExpense: expenseAmount,
        usedPettyCash: pettyDeduct,
        reimbursementCreated: reimbursementAmount,
        message: routing === 'petty_full'
          ? `✓ Rp ${formatRp(expenseAmount)} dipotong dari petty cash`
          : routing === 'petty_partial'
          ? `✓ Rp ${formatRp(pettyDeduct)} dari petty cash + Rp ${formatRp(reimbursementAmount)} reimbursement request (pending approval)`
          : `✓ Rp ${formatRp(expenseAmount)} jadi reimbursement request (petty cash habis/belum diset)`,
      },
    };
  } catch (e) {
    return { error: 'Add expense gagal: ' + (e?.message || 'unknown') };
  }
}

function formatRp(n) {
  return Number(n || 0).toLocaleString('id-ID');
}
