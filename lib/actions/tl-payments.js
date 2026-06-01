'use server';

// Round 177 v2: TL Payments — OPS yg ajukan request, TL HIDDEN
// Path: lib/actions/tl-payments.js

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sendFonnte, normalizePhone } from '@/lib/utils/fonnte';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function revalidateAll(tripId) {
  revalidatePath('/hr');
  revalidatePath('/hr/tl-payments');
  revalidatePath('/tl-master');
  revalidatePath('/tl');
  revalidatePath('/accounting');
  revalidatePath('/accounting/cashflow');
  revalidatePath('/finance/cashflow');
  revalidatePath('/finance/payments');
  if (tripId) {
    revalidatePath(`/tl/${tripId}`);
    revalidatePath(`/trips/${tripId}`);
    revalidatePath(`/finance/cashflow/${tripId}`);
  }
}

function fmtIDR(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
function fmtDateID(d) {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ============ R177v5: RESOLVE TL — prioritas EXACT NAME match ============
// Rationale: trip.tl_id mungkin pernah salah auto-link sebelumnya (partial match).
// Yang ditampilkan ke Ops di Master Trip adalah tl_name, jadi tl_name = source of truth.
async function resolveTLForTrip(supabase, trip) {
  const tlNameLower = (trip.tl_name || '').toLowerCase().trim();

  // STEP 1: EXACT name match (prioritas tertinggi)
  // → jaga konsistensi: nama di Master Trip = nama TL yg dipakai
  if (tlNameLower) {
    const { data: allTLs } = await supabase
      .from('employees')
      .select('*')
      .eq('employment_type', 'tour_leader');

    if (allTLs && allTLs.length > 0) {
      const exact = allTLs.find((e) =>
        (e.full_name || '').toLowerCase().trim() === tlNameLower ||
        (e.nickname || '').toLowerCase().trim() === tlNameLower
      );
      if (exact) return exact;
    }
  }

  // STEP 2: trip.tl_id (kalau ada & exact name match gak ada)
  if (trip.tl_id) {
    const { data: byId } = await supabase
      .from('employees')
      .select('*')
      .eq('id', trip.tl_id)
      .eq('employment_type', 'tour_leader')
      .maybeSingle();
    if (byId) {
      // Verifikasi: kalau trip.tl_name di-set & beda jauh dgn byId.full_name,
      // jangan pakai byId (kemungkinan auto-link salah dari versi lama)
      if (tlNameLower) {
        const byIdNameLower = (byId.full_name || '').toLowerCase().trim();
        const byIdNickLower = (byId.nickname || '').toLowerCase().trim();
        const isClose =
          byIdNameLower === tlNameLower ||
          byIdNickLower === tlNameLower ||
          (byIdNameLower && (tlNameLower.includes(byIdNameLower) || byIdNameLower.includes(tlNameLower))) ||
          (byIdNickLower && (tlNameLower.includes(byIdNickLower) || byIdNickLower.includes(tlNameLower)));
        if (!isClose) {
          // Mismatch — jangan return byId, lanjut ke partial match
          console.warn(`[resolveTLForTrip] trip.tl_id (${byId.full_name}) ≠ trip.tl_name (${trip.tl_name}). Falling back to name search.`);
        } else {
          return byId;
        }
      } else {
        return byId;
      }
    }
  }

  // STEP 3: Partial name match (last resort)
  if (tlNameLower) {
    const { data: allTLs2 } = await supabase
      .from('employees')
      .select('*')
      .eq('employment_type', 'tour_leader');

    if (allTLs2 && allTLs2.length > 0) {
      const partial = allTLs2.find((e) => {
        const fn = (e.full_name || '').toLowerCase().trim();
        const nk = (e.nickname || '').toLowerCase().trim();
        if (fn && (tlNameLower.includes(fn) || fn.includes(tlNameLower))) return true;
        if (nk && (tlNameLower.includes(nk) || nk.includes(tlNameLower))) return true;
        return false;
      });
      if (partial) return partial;
    }
  }

  return null;
}

// ============ R177v3: OPS REQUEST TL PAYMENT — bisa input nominal langsung ============
/**
 * Tim Ops/Manager/Finance/Owner yg ajukan request gaji TL untuk trip.
 *
 * @param {string} tripId
 * @param {'dp_70'|'final_30'} paymentType
 * @param {object} options
 *   - notes?: string
 *   - customAmount?: number    — nominal yg mau diajukan untuk termin ini (override calculated)
 *   - customTotalFee?: number  — total fee trip (basis 70/30, override per_trip_fee)
 */
export async function requestTLPayment(tripId, paymentType, options = {}) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Login dulu' };

  // ROLE GUARD — Ops/Manager/Finance (+ Owner) only
  const role = (user.user_metadata?.role || user.app_metadata?.role || '').toLowerCase();
  const ALLOWED = ['ops', 'manager', 'finance', 'owner'];
  if (!ALLOWED.includes(role)) {
    return { error: `Akses ditolak. Hanya Ops/Manager/Finance yg bisa ajukan request gaji TL. (role kamu: ${role || 'unknown'})` };
  }

  const supabase = getServiceClient() || authClient;

  if (!['dp_70', 'final_30'].includes(paymentType)) {
    return { error: 'paymentType harus dp_70 atau final_30' };
  }

  // Sanitize custom values dari input
  const customAmount = options.customAmount != null && options.customAmount !== ''
    ? Number(String(options.customAmount).replace(/[^0-9]/g, ''))
    : null;
  const customTotalFee = options.customTotalFee != null && options.customTotalFee !== ''
    ? Number(String(options.customTotalFee).replace(/[^0-9]/g, ''))
    : null;

  try {
    // 1) Get trip
    const { data: trip } = await supabase
      .from('trips')
      .select('*')
      .eq('id', tripId)
      .maybeSingle();
    if (!trip) return { error: 'Trip gak ditemukan' };

    // 2) Resolve TL dari trip
    const tl = await resolveTLForTrip(supabase, trip);
    if (!tl) {
      return {
        error: `Trip ini belum punya TL ter-link di /hr/employees. tl_name="${trip.tl_name || '-'}". Tambah TL dengan nama yg sama di HR dulu.`,
      };
    }

    // 3) Determine nominal — prioritas: customAmount > customTotalFee × 70/30 > per_trip_fee × 70/30
    const totalFeeBase = customTotalFee && customTotalFee > 0
      ? customTotalFee
      : Number(tl.per_trip_fee || 0);

    let amount;
    if (customAmount && customAmount > 0) {
      amount = customAmount;
    } else if (totalFeeBase > 0) {
      amount = paymentType === 'dp_70'
        ? Math.round(totalFeeBase * 0.7)
        : totalFeeBase - Math.round(totalFeeBase * 0.7);
    } else {
      return {
        error: `Isi nominal fee di form, ATAU set Fee per Trip di /hr/employees/${tl.id} dulu.`,
      };
    }

    if (amount <= 0) return { error: 'Nominal harus > 0' };

    // 4) Cek existing
    const { data: existing } = await supabase
      .from('tl_payments')
      .select('id, status')
      .eq('trip_id', tripId)
      .eq('tl_employee_id', tl.id)
      .eq('payment_type', paymentType)
      .maybeSingle();

    if (existing) {
      const labels = {
        requested: 'sudah pernah diajukan, menunggu approval HR',
        approved: 'sudah di-approve, tinggal nunggu transfer',
        paid: 'sudah dibayar',
        rejected: 'sebelumnya di-reject (reset dulu kalau mau ajukan lagi)',
        pending: 'sudah ada (status pending)',
      };
      return {
        error: `Request ${paymentType === 'dp_70' ? '70% DP' : '30% Final'} ${labels[existing.status] || 'sudah ada'}.`,
        existingId: existing.id,
      };
    }

    // 5) Warning untuk Final 30%
    let warning = null;
    if (paymentType === 'final_30') {
      const { data: dp } = await supabase
        .from('tl_payments')
        .select('id, status')
        .eq('trip_id', tripId)
        .eq('tl_employee_id', tl.id)
        .eq('payment_type', 'dp_70')
        .maybeSingle();
      if (!dp || dp.status !== 'paid') {
        warning = '⚠ DP 70% belum dibayar — Final 30% sebaiknya menunggu DP selesai.';
      }
    }

    const departure = trip.departure ? new Date(trip.departure) : null;
    const dueDate = paymentType === 'dp_70'
      ? (departure ? new Date(departure.getTime() - 7*24*60*60*1000).toISOString().slice(0,10) : null)
      : (trip.return_date || trip.departure || null);

    const requesterName = user.user_metadata?.full_name || user.email || 'unknown';

    // 6) Insert
    const { data: row, error: insErr } = await supabase
      .from('tl_payments')
      .insert({
        trip_id: trip.id,
        trip_kode: trip.kode_trip || null,
        trip_name: trip.name || null,
        trip_departure: trip.departure || null,
        trip_return: trip.return_date || null,
        tl_employee_id: tl.id,
        tl_name: tl.full_name || null,
        tl_phone: tl.whatsapp || tl.phone || null,
        tl_bank_name: tl.bank_name || null,
        tl_bank_account: tl.bank_account_number || null,
        tl_bank_holder: tl.bank_account_holder || null,
        payment_type: paymentType,
        total_fee: totalFeeBase || amount,
        amount,
        due_date: dueDate,
        status: 'requested',
        requested_at: new Date().toISOString(),
        requested_by: requesterName,
        requested_by_email: user.email,
        request_notes: options.notes || null,
      })
      .select('id')
      .single();

    if (insErr) return { error: insErr.message };

    // Auto-set employees.per_trip_fee kalau Ops baru isi customTotalFee & employee belum punya fee
    if (customTotalFee && customTotalFee > 0 && (!tl.per_trip_fee || tl.per_trip_fee <= 0)) {
      try {
        await supabase.from('employees').update({ per_trip_fee: customTotalFee }).eq('id', tl.id);
      } catch {}
    }

    // R177v5: Auto-link trips.tl_id HANYA kalau exact name match (prevent salah link)
    if (!trip.tl_id && trip.tl_name && tl.full_name &&
        trip.tl_name.toLowerCase().trim() === tl.full_name.toLowerCase().trim()) {
      try { await supabase.from('trips').update({ tl_id: tl.id }).eq('id', trip.id); } catch {}
    }

    revalidateAll(tripId);
    return {
      ok: true,
      id: row.id,
      amount,
      tl_name: tl.full_name,
      warning,
      message: `✓ Request ${paymentType === 'dp_70' ? '70% DP' : '30% Final'} ${fmtIDR(amount)} untuk TL ${tl.full_name} terkirim ke HR.`,
    };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ HR APPROVE — auto-create hpp_items ============
export async function approveTLPayment(id, formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const approvedBy = user.user_metadata?.full_name || user.email || 'unknown';
  const approvalNotes = formData?.get?.('approval_notes')?.toString().trim() || null;

  try {
    const { data: p, error: getErr } = await supabase
      .from('tl_payments')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (getErr) return { error: getErr.message };
    if (!p) return { error: 'Request gak ditemukan' };
    if (p.status === 'approved' || p.status === 'paid') return { error: 'Sudah di-approve sebelumnya' };
    if (p.status === 'rejected') return { error: 'Sebelumnya di-reject. Reset dulu ke requested kalau mau approve.' };

    const { error: updErr } = await supabase
      .from('tl_payments')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: approvedBy,
        approval_notes: approvalNotes,
      })
      .eq('id', id);
    if (updErr) return { error: updErr.message };

    // R177v4: Insert ke trip_finance_items (BUKAN hpp_items)
    // Ini yg dibaca oleh accounting cash out, proyeksi income, & real cashflow
    const typeLabel = p.payment_type === 'dp_70' ? '70% DP' : '30% Final';
    const hppPayload = {
      trip_id: p.trip_id,
      item_type: 'hpp',
      category: 'TL Fee',
      component: `TL Fee — ${p.tl_name} — ${typeLabel}`,
      vendor_name: p.tl_name || 'TL',
      basic_fare: Number(p.amount) || 0,
      qty: 1,
      total_amount: Number(p.amount) || 0,
      payment_status: 'belum', // belum lunas → muncul di PROYEKSI cashflow (booked, not paid)
      source: 'tl_payment',
      source_id: id,
      notes: `Auto-created dari TL payment approval. Trip: ${p.trip_kode || p.trip_id}. Approved by: ${approvedBy}`,
    };

    let hppId = null;
    try {
      const hppRes = await supabase.from('trip_finance_items').insert(hppPayload).select('id').single();
      if (hppRes.data) hppId = hppRes.data.id;
      else if (hppRes.error && /column|schema|source/i.test(hppRes.error.message)) {
        // Defensive: strip optional columns kalau gak ada (source / notes)
        const stripped = {
          trip_id: p.trip_id,
          item_type: 'hpp',
          category: 'TL Fee',
          component: `TL Fee — ${p.tl_name} — ${typeLabel}`,
          vendor_name: p.tl_name || 'TL',
          basic_fare: Number(p.amount) || 0,
          qty: 1,
          total_amount: Number(p.amount) || 0,
          payment_status: 'belum',
        };
        const retry = await supabase.from('trip_finance_items').insert(stripped).select('id').single();
        if (retry.data) hppId = retry.data.id;
        else if (retry.error) console.error('[approveTLPayment] retry insert:', retry.error.message);
      }
    } catch (hppErr) {
      console.error('[approveTLPayment] trip_finance_items insert error:', hppErr?.message);
    }

    if (hppId) {
      try { await supabase.from('tl_payments').update({ hpp_item_id: hppId }).eq('id', id); } catch {}
    }

    revalidateAll(p.trip_id);
    return {
      ok: true,
      hppId,
      message: hppId
        ? `✓ Approved. Booked ${fmtIDR(p.amount)} di HPP trip (status: belum lunas → muncul di proyeksi cashflow). Mark Paid untuk masuk real cashflow.`
        : `✓ Approved tapi gagal insert ke trip_finance_items — cek log Vercel/Supabase.`,
    };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ HR REJECT ============
export async function rejectTLPayment(id, formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const rejectedBy = user.user_metadata?.full_name || user.email || 'unknown';
  const reason = formData?.get?.('reject_reason')?.toString().trim() || null;

  if (!reason) return { error: 'Alasan reject wajib diisi' };

  try {
    const { data: p } = await supabase
      .from('tl_payments')
      .select('trip_id, hpp_item_id, status')
      .eq('id', id)
      .maybeSingle();
    if (!p) return { error: 'Request gak ditemukan' };

    if (p.hpp_item_id) {
      try { await supabase.from('trip_finance_items').delete().eq('id', p.hpp_item_id); } catch {}
    }

    const { error } = await supabase
      .from('tl_payments')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        rejected_by: rejectedBy,
        reject_reason: reason,
        hpp_item_id: null,
      })
      .eq('id', id);
    if (error) return { error: error.message };

    revalidateAll(p.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

export async function resetTLPaymentToRequested(id) {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: p } = await supabase
      .from('tl_payments')
      .select('trip_id, hpp_item_id')
      .eq('id', id)
      .maybeSingle();

    if (p?.hpp_item_id) {
      try { await supabase.from('trip_finance_items').delete().eq('id', p.hpp_item_id); } catch {}
    }

    const { error } = await supabase
      .from('tl_payments')
      .update({
        status: 'requested',
        approved_at: null,
        approved_by: null,
        approval_notes: null,
        rejected_at: null,
        rejected_by: null,
        reject_reason: null,
        hpp_item_id: null,
        paid_at: null,
        paid_by: null,
        paid_amount: null,
        payment_method: null,
      })
      .eq('id', id);
    if (error) return { error: error.message };

    revalidateAll(p?.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ MARK PAID — flip hpp_items.is_paid = true ============
export async function markTLPaymentPaid(id, formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const paidBy = user.user_metadata?.full_name || user.email || 'unknown';

  const paidAmountRaw = formData.get('paid_amount');
  const paidAmount = paidAmountRaw ? Number(String(paidAmountRaw).replace(/[^0-9]/g, '')) : null;
  const paymentMethod = (formData.get('payment_method') || 'transfer').toString();
  const notes = (formData.get('notes') || '').toString().trim() || null;

  try {
    const { data: p } = await supabase
      .from('tl_payments')
      .select('trip_id, hpp_item_id, status, amount')
      .eq('id', id)
      .maybeSingle();
    if (!p) return { error: 'Payment gak ditemukan' };
    if (p.status !== 'approved' && p.status !== 'pending') {
      return { error: `Status saat ini "${p.status}" — harus 'approved' dulu sebelum Mark Paid` };
    }

    const { error } = await supabase
      .from('tl_payments')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        paid_amount: paidAmount || p.amount,
        paid_by: paidBy,
        payment_method: paymentMethod,
        notes,
      })
      .eq('id', id);
    if (error) return { error: error.message };

    // R177v4b: Update trip_finance_items — set transfer_date supaya muncul di Cash Out list (yg filter by date)
    const todayDate = new Date().toISOString().slice(0, 10);
    if (p.hpp_item_id) {
      try {
        // Try update with full date fields
        const upd = await supabase
          .from('trip_finance_items')
          .update({
            payment_status: 'lunas',
            transfer_date: todayDate,
            payoff_date: todayDate,
            paid_at: new Date().toISOString(),
          })
          .eq('id', p.hpp_item_id);
        if (upd.error) {
          // Strip unknown columns one at a time
          const tryFields = [
            { payment_status: 'lunas', transfer_date: todayDate, payoff_date: todayDate },
            { payment_status: 'lunas', transfer_date: todayDate },
            { payment_status: 'lunas', payoff_date: todayDate },
            { payment_status: 'lunas' },
          ];
          for (const fields of tryFields) {
            const r = await supabase.from('trip_finance_items').update(fields).eq('id', p.hpp_item_id);
            if (!r.error) break;
          }
        }
      } catch (e) {
        console.error('[markTLPaymentPaid] trip_finance_items update error:', e?.message);
      }
    } else {
      // Edge case: tl_payment ada di status 'pending' (sebelum R177) tanpa hpp_item_id
      // Atau approve gagal insert. Buat entry sekarang sebagai LUNAS langsung.
      try {
        const typeLabel = p.payment_type === 'dp_70' ? '70% DP' : '30% Final';
        const { data: pFull } = await supabase
          .from('tl_payments')
          .select('tl_name, trip_kode, payment_type')
          .eq('id', id)
          .maybeSingle();
        const tlName = pFull?.tl_name || 'TL';
        const tripKode = pFull?.trip_kode || p.trip_id;
        const fullPayload = {
          trip_id: p.trip_id,
          item_type: 'hpp',
          category: 'TL Fee',
          component: `TL Fee — ${tlName} — ${typeLabel}`,
          vendor_name: tlName,
          basic_fare: Number(p.amount) || 0,
          qty: 1,
          total_amount: Number(p.amount) || 0,
          payment_status: 'lunas',
          transfer_date: todayDate,
          payoff_date: todayDate,
          source: 'tl_payment',
          source_id: id,
        };
        let insertRes = await supabase.from('trip_finance_items').insert(fullPayload).select('id').single();
        if (insertRes.error) {
          // Strip unknown columns
          const stripped = {
            trip_id: p.trip_id,
            item_type: 'hpp',
            category: 'TL Fee',
            component: `TL Fee — ${tlName} — ${typeLabel}`,
            vendor_name: tlName,
            basic_fare: Number(p.amount) || 0,
            qty: 1,
            total_amount: Number(p.amount) || 0,
            payment_status: 'lunas',
            transfer_date: todayDate,
          };
          insertRes = await supabase.from('trip_finance_items').insert(stripped).select('id').single();
        }
        if (insertRes.data?.id) {
          await supabase.from('tl_payments').update({ hpp_item_id: insertRes.data.id }).eq('id', id);
        }
      } catch (e) {
        console.error('[markTLPaymentPaid] auto-create hpp error:', e?.message);
      }
    }

    revalidateAll(p.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

export async function unmarkTLPaymentPaid(id) {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: p } = await supabase
      .from('tl_payments')
      .select('trip_id, hpp_item_id')
      .eq('id', id)
      .maybeSingle();

    const { error } = await supabase
      .from('tl_payments')
      .update({
        status: 'approved',
        paid_at: null,
        paid_amount: null,
        paid_by: null,
        payment_method: null,
      })
      .eq('id', id);
    if (error) return { error: error.message };

    if (p?.hpp_item_id) {
      try {
        // R177v4: revert trip_finance_items status ke 'belum'
        await supabase
          .from('trip_finance_items')
          .update({ payment_status: 'belum', paid_at: null })
          .eq('id', p.hpp_item_id);
      } catch {}
    }

    revalidateAll(p?.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

export async function markFinalReportSubmitted(id, formData) {
  const supabase = getServiceClient() || createClient();
  const reportNotes = formData?.get?.('final_report_notes')?.toString().trim() || null;
  try {
    const { data: p } = await supabase.from('tl_payments').select('trip_id').eq('id', id).maybeSingle();
    const { error } = await supabase
      .from('tl_payments')
      .update({
        final_report_submitted: true,
        final_report_submitted_at: new Date().toISOString(),
        final_report_notes: reportNotes,
      })
      .eq('id', id);
    if (error) return { error: error.message };
    revalidateAll(p?.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

export async function unmarkFinalReportSubmitted(id) {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: p } = await supabase.from('tl_payments').select('trip_id').eq('id', id).maybeSingle();
    const { error } = await supabase
      .from('tl_payments')
      .update({ final_report_submitted: false, final_report_submitted_at: null })
      .eq('id', id);
    if (error) return { error: error.message };
    revalidateAll(p?.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

export async function deleteTLPayment(id) {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: p } = await supabase
      .from('tl_payments')
      .select('trip_id, hpp_item_id')
      .eq('id', id)
      .maybeSingle();

    if (p?.hpp_item_id) {
      try { await supabase.from('trip_finance_items').delete().eq('id', p.hpp_item_id); } catch {}
    }

    const { error } = await supabase.from('tl_payments').delete().eq('id', id);
    if (error) return { error: error.message };
    revalidateAll(p?.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ PAYMENT PROOF ============
export async function uploadTLPaymentProof(id, formData) {
  const supabase = getServiceClient() || createClient();
  const file = formData.get('file');
  if (!file || typeof file === 'string') return { error: 'File wajib' };

  try {
    const ext = file.name?.split('.').pop()?.toLowerCase() || 'bin';
    const key = `tl-${id}-${Date.now()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await supabase.storage
      .from('payroll-proofs')
      .upload(key, buf, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
    if (upErr) return { error: 'Upload error: ' + upErr.message };

    const { error: dbErr } = await supabase
      .from('tl_payments')
      .update({ payment_proof_url: key })
      .eq('id', id);
    if (dbErr) return { error: dbErr.message };

    revalidateAll();
    return { ok: true, key };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

export async function getTLPaymentProofSignedUrl(id) {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: row } = await supabase
      .from('tl_payments')
      .select('payment_proof_url')
      .eq('id', id)
      .maybeSingle();
    if (!row?.payment_proof_url) return { error: 'Belum ada bukti' };

    const { data, error } = await supabase.storage
      .from('payroll-proofs')
      .createSignedUrl(row.payment_proof_url, 600);
    if (error) return { error: error.message };
    return { ok: true, url: data.signedUrl };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

export async function deleteTLPaymentProof(id) {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: row } = await supabase
      .from('tl_payments')
      .select('payment_proof_url')
      .eq('id', id)
      .maybeSingle();
    if (row?.payment_proof_url) {
      await supabase.storage.from('payroll-proofs').remove([row.payment_proof_url]);
    }
    await supabase.from('tl_payments').update({ payment_proof_url: null }).eq('id', id);
    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ SEND SLIP TO WHATSAPP ============
export async function sendTLPaymentSlipToWA(id, options = {}) {
  const supabase = getServiceClient() || createClient();

  try {
    const { data: p, error } = await supabase
      .from('tl_payments')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!p) return { error: 'Payment gak ditemukan' };

    const phone = options.targetPhone || p.tl_phone;
    if (!phone) return { error: 'TL belum punya nomor HP/WA' };

    const isPaid = p.status === 'paid';
    const isApproved = p.status === 'approved';
    const typeLabel = p.payment_type === 'dp_70' ? '70% (DP)' : '30% (Final)';

    const message = [
      `🌟 *SLIP PEMBAYARAN TOUR LEADER* 🌟`,
      ``,
      `Hai *${p.tl_name || 'TL'}*,`,
      ``,
      `📌 *Trip:* ${p.trip_kode || ''} ${p.trip_name || ''}`.trim(),
      `📅 *Keberangkatan:* ${fmtDateID(p.trip_departure)}`,
      ``,
      `💰 *Total Fee Trip:* ${fmtIDR(p.total_fee)}`,
      `📊 *Termin:* ${typeLabel}`,
      `💵 *Nominal:* ${fmtIDR(p.amount)}`,
      `📆 *Jatuh Tempo:* ${fmtDateID(p.due_date)}`,
      ``,
      isPaid ? `✅ *STATUS: SUDAH DIBAYAR* (${fmtDateID(p.paid_at)})` :
        isApproved ? `✓ *STATUS: APPROVED — menunggu transfer*` :
        `⏳ *STATUS: ${(p.status || '').toUpperCase()}*`,
      ``,
      p.tl_bank_name ? `🏦 *Transfer ke:*\n${p.tl_bank_name}\n${p.tl_bank_account}\na.n. ${p.tl_bank_holder}` : null,
      ``,
      `_TEONE — Traveling Eropa_`,
    ].filter((x) => x !== null).join('\n');

    const result = await sendFonnte(phone, message, { context: 'finance' });

    if (result.error) return { error: result.error, sentVia: result.sentVia };

    await supabase
      .from('tl_payments')
      .update({
        wa_sent_at: new Date().toISOString(),
        wa_sent_to: normalizePhone(phone),
      })
      .eq('id', id);

    revalidateAll(p.trip_id);
    return { ok: true, sentVia: result.sentVia, target: normalizePhone(phone) };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ DASHBOARD STATS ============
export async function getTLPaymentsStats() {
  const empty = {
    total: 0, requested: 0, approved: 0, paid: 0, rejected: 0, overdue: 0,
    total_amount_requested: 0, total_amount_approved: 0, total_amount_paid: 0,
  };
  try {
    const supabase = getServiceClient() || createClient();
    const { data, error } = await supabase
      .from('tl_payments')
      .select('id, status, amount, due_date');
    if (error) {
      if (/relation.*does not exist/i.test(error.message)) return { ...empty, setup_needed: true };
      return empty;
    }
    const today = new Date().toISOString().slice(0, 10);
    const stats = { ...empty, total: data.length };
    for (const p of data) {
      const amt = Number(p.amount || 0);
      if (p.status === 'requested') { stats.requested++; stats.total_amount_requested += amt; }
      else if (p.status === 'approved') { stats.approved++; stats.total_amount_approved += amt; }
      else if (p.status === 'paid') { stats.paid++; stats.total_amount_paid += amt; }
      else if (p.status === 'rejected') { stats.rejected++; }
      if (p.status !== 'paid' && p.status !== 'rejected' && p.due_date && p.due_date < today) {
        stats.overdue++;
      }
    }
    return stats;
  } catch {
    return empty;
  }
}

// ============ GET REQUESTS FOR A TRIP ============
export async function getTLPaymentsForTrip(tripId) {
  const supabase = getServiceClient() || createClient();
  const { data } = await supabase
    .from('tl_payments')
    .select('id, payment_type, status, amount, requested_at, requested_by, approved_at, approved_by, paid_at, reject_reason')
    .eq('trip_id', tripId)
    .order('payment_type');
  return data || [];
}

// ============ R177v4: SYNC SINGLE PAYMENT TO ACCOUNTING ============
/**
 * Sync 1 tl_payment ke trip_finance_items.
 * Idempotent — bisa di-call ulang. Akan create kalau belum ada, update kalau udah.
 */
export async function syncTLPaymentToAccounting(id) {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: p, error } = await supabase
      .from('tl_payments')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!p) return { error: 'Payment gak ditemukan' };

    // Status mapping ke payment_status
    let financeStatus = null;
    if (p.status === 'paid') financeStatus = 'lunas';
    else if (p.status === 'approved') financeStatus = 'belum';
    else if (p.status === 'pending') financeStatus = 'belum';
    // requested / rejected → no entry (delete kalau ada)

    // R177v4b: tentukan tanggal — kalau paid pakai paid_at, kalau belum biarin null
    const paidDate = p.paid_at ? p.paid_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const transferDate = financeStatus === 'lunas' ? paidDate : null;

    const typeLabel = p.payment_type === 'dp_70' ? '70% DP' : '30% Final';
    const payload = {
      trip_id: p.trip_id,
      item_type: 'hpp',
      category: 'TL Fee',
      component: `TL Fee — ${p.tl_name} — ${typeLabel}`,
      vendor_name: p.tl_name || 'TL',
      basic_fare: Number(p.amount) || 0,
      qty: 1,
      total_amount: Number(p.amount) || 0,
      payment_status: financeStatus,
      transfer_date: transferDate,
      payoff_date: transferDate,
    };

    if (!financeStatus) {
      // Status requested/rejected — hapus entry kalau ada
      if (p.hpp_item_id) {
        try {
          await supabase.from('trip_finance_items').delete().eq('id', p.hpp_item_id);
          await supabase.from('tl_payments').update({ hpp_item_id: null }).eq('id', id);
        } catch {}
      }
      revalidateAll(p.trip_id);
      return { ok: true, action: 'deleted', message: 'Status request/rejected — entry accounting dihapus.' };
    }

    let action = '';
    if (p.hpp_item_id) {
      // UPDATE existing
      const updPayload = {
        component: payload.component,
        vendor_name: payload.vendor_name,
        basic_fare: payload.basic_fare,
        qty: payload.qty,
        total_amount: payload.total_amount,
        payment_status: payload.payment_status,
        transfer_date: payload.transfer_date,
        payoff_date: payload.payoff_date,
      };
      let upd = await supabase
        .from('trip_finance_items')
        .update(updPayload)
        .eq('id', p.hpp_item_id);
      if (upd.error && /transfer_date|payoff_date|column/i.test(upd.error.message)) {
        // Defensive — strip unknown columns
        delete updPayload.transfer_date;
        delete updPayload.payoff_date;
        upd = await supabase.from('trip_finance_items').update(updPayload).eq('id', p.hpp_item_id);
      }
      if (upd.error) {
        // Row mungkin di-delete manual — re-insert
        if (/no rows|row|not found/i.test(upd.error.message)) {
          const ins = await supabase.from('trip_finance_items').insert(payload).select('id').single();
          if (ins.data?.id) {
            await supabase.from('tl_payments').update({ hpp_item_id: ins.data.id }).eq('id', id);
            action = 'recreated';
          }
        } else {
          return { error: 'Update gagal: ' + upd.error.message };
        }
      } else {
        action = 'updated';
      }
    } else {
      // INSERT new — defensive multi-retry
      const fullPayload = { ...payload, source: 'tl_payment', source_id: id };
      let insRes = await supabase.from('trip_finance_items').insert(fullPayload).select('id').single();

      if (insRes.error) {
        // Retry tanpa source columns
        let p2 = { ...payload };
        insRes = await supabase.from('trip_finance_items').insert(p2).select('id').single();
      }
      if (insRes.error && /transfer_date|payoff_date|column/i.test(insRes.error.message)) {
        // Retry tanpa date columns
        let p3 = { ...payload };
        delete p3.transfer_date;
        delete p3.payoff_date;
        insRes = await supabase.from('trip_finance_items').insert(p3).select('id').single();
      }

      if (insRes.data?.id) {
        await supabase.from('tl_payments').update({ hpp_item_id: insRes.data.id }).eq('id', id);
        action = 'created';
      } else if (insRes.error) {
        return { error: 'Insert gagal: ' + insRes.error.message };
      }
    }

    revalidateAll(p.trip_id);
    return {
      ok: true,
      action,
      message: `✓ Sync OK: ${action} entry ${fmtIDR(p.amount)} (payment_status: ${financeStatus}) di trip_finance_items.`,
    };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ R177v4: BULK SYNC SEMUA TL PAYMENTS ============
/**
 * Sweep semua tl_payments dan sync ke trip_finance_items.
 * Berguna untuk backfill data lama yg approve/paid sebelum integration fix.
 */
export async function bulkSyncTLPaymentsToAccounting() {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: payments, error } = await supabase
      .from('tl_payments')
      .select('id, status, hpp_item_id, amount')
      .in('status', ['approved', 'paid', 'pending']);
    if (error) return { error: error.message };

    let synced = 0, errors = [];
    for (const p of payments || []) {
      const r = await syncTLPaymentToAccounting(p.id);
      if (r.error) errors.push(`#${p.id}: ${r.error}`);
      else synced++;
    }

    return {
      ok: true,
      total_checked: payments?.length || 0,
      synced,
      errors,
      message: `✓ ${synced}/${payments?.length || 0} payments synced ke accounting.`,
    };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ R177v5: RE-LINK TL — fix payment yg ke-bind ke TL salah ============
/**
 * Re-resolve TL dari trip.tl_name & update tl_payments + linked trip_finance_items.
 * Berguna untuk fix data yg sebelumnya ke-bind ke wildan rivky padahal harusnya
 * Emirates Groupdesk (bug partial match dari versi lama).
 */
export async function relinkTLPaymentToCorrectTL(id) {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: p } = await supabase
      .from('tl_payments')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!p) return { error: 'Payment gak ditemukan' };

    // Ambil trip fresh
    const { data: trip } = await supabase
      .from('trips')
      .select('*')
      .eq('id', p.trip_id)
      .maybeSingle();
    if (!trip) return { error: 'Trip gak ditemukan' };

    // Re-resolve TL dari trip.tl_name (skema baru v5 prioritas exact name)
    const correctTL = await resolveTLForTrip(supabase, trip);
    if (!correctTL) {
      return { error: `TL "${trip.tl_name}" gak ditemukan di /hr/employees. Tambah dulu.` };
    }

    if (String(correctTL.id) === String(p.tl_employee_id)) {
      return { ok: true, message: '✓ Sudah ter-link ke TL yg benar — gak ada perubahan.' };
    }

    const oldName = p.tl_name;
    const newName = correctTL.full_name;

    // Update tl_payments
    const updPayload = {
      tl_employee_id: correctTL.id,
      tl_name: correctTL.full_name || null,
      tl_phone: correctTL.whatsapp || correctTL.phone || null,
      tl_bank_name: correctTL.bank_name || null,
      tl_bank_account: correctTL.bank_account_number || null,
      tl_bank_holder: correctTL.bank_account_holder || null,
    };
    const { error: updErr } = await supabase
      .from('tl_payments')
      .update(updPayload)
      .eq('id', id);
    if (updErr) return { error: 'Update tl_payments: ' + updErr.message };

    // Update linked trip_finance_items
    if (p.hpp_item_id) {
      const typeLabel = p.payment_type === 'dp_70' ? '70% DP' : '30% Final';
      try {
        await supabase
          .from('trip_finance_items')
          .update({
            component: `TL Fee — ${newName} — ${typeLabel}`,
            vendor_name: newName,
          })
          .eq('id', p.hpp_item_id);
      } catch {}
    }

    revalidateAll(p.trip_id);
    return {
      ok: true,
      message: `✓ Re-linked dari "${oldName}" → "${newName}". Cash out + accounting udah update.`,
    };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}
