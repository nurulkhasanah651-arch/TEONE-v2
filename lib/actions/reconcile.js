'use server';

// Round 92: Bank Reconciliation actions
// - Import mutasi dari CSV
// - Auto-match dengan trip_finance_items (Cash In + HPP)
// - Manual match/unmatch
// - Mark as ignored

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

function revalidateAll() {
  revalidatePath('/accounting');
  revalidatePath('/accounting/reconcile');
  revalidatePath('/finance');
  revalidatePath('/finance/cashflow');
}

// ============================================================
// IMPORT mutasi (dari client component yang sudah parse CSV)
// ============================================================
export async function importBankMutations(rows, bankName = 'BCA') {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!Array.isArray(rows) || rows.length === 0) {
    return { error: 'Tidak ada baris untuk di-import' };
  }

  const imported_by = user.user_metadata?.full_name || user.email || 'unknown';
  let inserted = 0;
  let skipped = 0;
  const errors = [];

  for (const r of rows) {
    const payload = {
      bank_name: bankName,
      tanggal: r.tanggal,
      keterangan: r.keterangan || null,
      amount: Number(r.amount) || 0,
      type: r.type === 'db' ? 'db' : 'cr',
      saldo: r.saldo || null,
      reference: r.reference || null,
      imported_by,
      raw_data: r.raw || null,
      match_status: 'unmatched',
    };

    const { error } = await supabase.from('bank_mutations').insert(payload);
    if (error) {
      // Duplikat → skip
      if (error.code === '23505') {
        skipped++;
      } else {
        errors.push(`${r.tanggal} ${r.keterangan}: ${error.message}`);
      }
    } else {
      inserted++;
    }
  }

  revalidateAll();
  return { ok: true, inserted, skipped, errors };
}

// ============================================================
// AUTO-MATCH: cari finance item yang cocok dengan mutation
// ============================================================
export async function autoMatchAll() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Fetch unmatched mutations
  const { data: mutations } = await supabase
    .from('bank_mutations')
    .select('*')
    .eq('match_status', 'unmatched')
    .order('tanggal', { ascending: false });

  if (!Array.isArray(mutations) || mutations.length === 0) {
    return { ok: true, matched: 0, message: 'Tidak ada mutasi yang unmatched' };
  }

  // Fetch all finance items
  const { data: items } = await supabase
    .from('trip_finance_items')
    .select('id, trip_id, item_type, total_amount, dp_paid, vendor_name, category, component, payment_status, created_at, payment_approved_at');

  const safeItems = Array.isArray(items) ? items : [];

  let matchedCount = 0;
  for (const m of mutations) {
    // Match strategy:
    // - CR (uang masuk) → match dengan income items OR payment dari peserta
    // - DB (uang keluar) → match dengan HPP items yang lunas/DP dibayar

    const isCredit = m.type === 'cr';
    const candidateItems = safeItems.filter((it) => {
      if (isCredit) return it.item_type === 'income';
      return it.item_type === 'hpp';
    });

    // Match by amount + date proximity
    let bestMatch = null;
    let bestScore = 0;

    for (const it of candidateItems) {
      let score = 0;

      // Exact amount match
      const itAmount = isCredit ? Number(it.total_amount) : Number(it.dp_paid);
      if (itAmount === Number(m.amount)) score += 3;
      else if (Math.abs(itAmount - Number(m.amount)) < 1000) score += 2;
      else continue; // Skip kalau amount jauh

      // Date proximity (±3 days)
      const itDate = it.payment_approved_at || it.created_at;
      if (itDate) {
        const itD = new Date(itDate);
        const mD = new Date(m.tanggal);
        const diffDays = Math.abs((itD - mD) / (1000 * 60 * 60 * 24));
        if (diffDays <= 1) score += 2;
        else if (diffDays <= 3) score += 1;
      }

      // Vendor/keterangan keyword match
      if (it.vendor_name && m.keterangan) {
        const vendor = it.vendor_name.toLowerCase();
        const ket = m.keterangan.toLowerCase();
        if (ket.includes(vendor) || vendor.includes(ket.slice(0, 10))) score += 2;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = it;
      }
    }

    if (bestMatch && bestScore >= 3) {
      const confidence = bestScore >= 5 ? 'high' : bestScore >= 4 ? 'medium' : 'low';
      const { error } = await supabase
        .from('bank_mutations')
        .update({
          matched_finance_item_id: bestMatch.id,
          matched_trip_id: bestMatch.trip_id,
          match_status: 'matched',
          match_confidence: confidence,
        })
        .eq('id', m.id);

      if (!error) matchedCount++;
    }
  }

  revalidateAll();
  return { ok: true, matched: matchedCount, total: mutations.length };
}

// ============================================================
// MANUAL MATCH: link mutation ke finance item specific
// ============================================================
export async function manualMatch(mutationId, financeItemId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: item } = await supabase
    .from('trip_finance_items')
    .select('trip_id')
    .eq('id', financeItemId)
    .maybeSingle();

  const { error } = await supabase
    .from('bank_mutations')
    .update({
      matched_finance_item_id: financeItemId,
      matched_trip_id: item?.trip_id || null,
      match_status: 'manual',
      match_confidence: 'high',
    })
    .eq('id', mutationId);

  if (error) return { error: error.message };

  revalidateAll();
  return { ok: true };
}

export async function unmatch(mutationId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('bank_mutations')
    .update({
      matched_finance_item_id: null,
      matched_trip_id: null,
      match_status: 'unmatched',
      match_confidence: null,
    })
    .eq('id', mutationId);

  if (error) return { error: error.message };

  revalidateAll();
  return { ok: true };
}

export async function markIgnored(mutationId, note) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('bank_mutations')
    .update({
      match_status: 'ignored',
      notes: note || 'Marked as ignored',
    })
    .eq('id', mutationId);

  if (error) return { error: error.message };

  revalidateAll();
  return { ok: true };
}

export async function deleteMutation(mutationId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.from('bank_mutations').delete().eq('id', mutationId);
  if (error) return { error: error.message };

  revalidateAll();
  return { ok: true };
}
