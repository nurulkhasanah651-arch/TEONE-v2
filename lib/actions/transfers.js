'use server';

// Round 122: Transfer + auto-recalculate trip.sold untuk both source & target
// + defensive payment copy

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Helper: recalculate trip.sold dan seat_left
async function recalculateTripStats(supabase, tripId) {
  if (!tripId) return;
  try {
    const { count } = await supabase
      .from('trip_passengers')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', tripId)
      .neq('transfer_status', 'transferred');

    const activeCount = count || 0;

    const { data: trip } = await supabase
      .from('trips').select('quota').eq('id', tripId).maybeSingle();
    const quota = trip?.quota || 0;
    const seatLeft = Math.max(quota - activeCount, 0);

    await supabase.from('trips').update({
      sold: activeCount,
      seat_left: seatLeft,
    }).eq('id', tripId);
  } catch (e) {
    // Defensive — kalau column sold/seat_left gak ada, skip
  }
}

export async function transferPassenger({
  passengerId, targetTripId, reason = '',
  transferFamily = false, cancelUnpaidInvoices = true,
}) {
  if (!passengerId || !targetTripId) return { error: 'passengerId dan targetTripId wajib' };

  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set di env' };

  try {
    const { data: oldPax, error: paxErr } = await supabase
      .from('trip_passengers').select('*').eq('id', passengerId).maybeSingle();
    if (paxErr || !oldPax) return { error: 'Peserta tidak ditemukan' };
    if (oldPax.trip_id === targetTripId) return { error: 'Peserta sudah di trip ini' };
    if (oldPax.transfer_status === 'transferred') return { error: 'Peserta sudah pernah dipindah sebelumnya' };

    const { data: targetTrip } = await supabase
      .from('trips').select('id, name, kode_trip').eq('id', targetTripId).maybeSingle();
    if (!targetTrip) return { error: 'Trip tujuan tidak ditemukan' };

    const sourceTripId = oldPax.trip_id;

    let passengersToTransfer = [oldPax];
    if (transferFamily && oldPax.family_group_id) {
      const { data: familyMembers } = await supabase
        .from('trip_passengers')
        .select('*')
        .eq('family_group_id', oldPax.family_group_id)
        .neq('transfer_status', 'transferred');
      if (familyMembers && familyMembers.length > 0) passengersToTransfer = familyMembers;
    }

    const results = [];
    const transferredAt = new Date().toISOString();

    for (const oldP of passengersToTransfer) {
      const skipFields = [
        'id', 'created_at', 'updated_at', 'trip_id',
        'family_group_id',
        'transfer_status', 'transferred_to_trip_id', 'transferred_to_passenger_id',
        'transferred_from_trip_id', 'transferred_from_passenger_id',
        'transferred_at', 'transfer_reason',
      ];
      const newPaxData = {};
      for (const [k, v] of Object.entries(oldP)) {
        if (!skipFields.includes(k)) newPaxData[k] = v;
      }
      newPaxData.trip_id = targetTripId;
      newPaxData.transfer_status = 'received';
      newPaxData.transferred_from_trip_id = sourceTripId;
      newPaxData.transferred_from_passenger_id = String(oldP.id); // text-safe
      newPaxData.transferred_at = transferredAt;
      newPaxData.transfer_reason = reason;

      const { data: newPax, error: insertErr } = await supabase
        .from('trip_passengers').insert(newPaxData).select().single();

      if (insertErr) {
        results.push({ oldId: oldP.id, error: insertErr.message });
        continue;
      }

      // Copy payments — TANPA trip_id (schema gak punya)
      try {
        let paymentsQuery = supabase
          .from('participant_payments').select('*').eq('passenger_id', oldP.id);
        let payments = null;
        try {
          const r = await paymentsQuery.eq('is_transferred', false);
          payments = r.data;
        } catch {
          const r = await paymentsQuery;
          payments = r.data;
        }

        if (payments && payments.length > 0) {
          const newPayments = payments.map((p) => {
            const np = { ...p };
            delete np.id; delete np.created_at;
            delete np.is_transferred; delete np.transferred_to_payment_id; delete np.transfer_note;
            np.passenger_id = newPax.id;
            np.notes = (p.notes || '') + ` [Transferred from pax ${oldP.id}]`;
            return np;
          });

          const { data: insertedPayments, error: payErr } = await supabase
            .from('participant_payments').insert(newPayments).select();

          if (payErr) {
            results.push({ oldId: oldP.id, paymentsError: payErr.message });
          } else if (insertedPayments) {
            // Mark old as transferred
            for (let i = 0; i < Math.min(payments.length, insertedPayments.length); i++) {
              try {
                await supabase.from('participant_payments').update({
                  is_transferred: true,
                  transferred_to_payment_id: insertedPayments[i].id,
                  transfer_note: `Transferred to trip ${targetTrip.kode_trip || targetTripId}`,
                }).eq('id', payments[i].id);
              } catch {}
            }
          }
        }
      } catch (e) {
        results.push({ oldId: oldP.id, paymentsError: e?.message });
      }

      // Handle invoices
      try {
        const { data: invoices } = await supabase
          .from('invoices').select('*').eq('passenger_id', oldP.id);
        for (const inv of (invoices || [])) {
          if (inv.status === 'paid') {
            await supabase.from('invoices').update({
              notes: (inv.notes || '') + `\n[Transferred to ${targetTrip.kode_trip}]`,
            }).eq('id', inv.id);
          } else if (cancelUnpaidInvoices && ['sent', 'draft', 'overdue'].includes(inv.status)) {
            await supabase.from('invoices').update({
              status: 'cancelled',
              notes: (inv.notes || '') + `\n[Cancelled: peserta pindah]`,
            }).eq('id', inv.id);
          }
        }
      } catch {}

      // Mark old pax as transferred
      await supabase.from('trip_passengers').update({
        transfer_status: 'transferred',
        transferred_to_trip_id: targetTripId,
        transferred_to_passenger_id: String(newPax.id),
        transferred_at: transferredAt,
        transfer_reason: reason,
      }).eq('id', oldP.id);

      results.push({ oldId: oldP.id, newId: newPax.id, ok: true });
    }

    // ROUND 122: Recalculate trip stats untuk BOTH trips
    await recalculateTripStats(supabase, sourceTripId);
    await recalculateTripStats(supabase, targetTripId);

    revalidatePath('/trips');
    revalidatePath(`/trips/${sourceTripId}`);
    revalidatePath(`/trips/${targetTripId}`);
    revalidatePath('/finance/payments');
    revalidatePath(`/finance/payments/${sourceTripId}`);
    revalidatePath(`/finance/payments/${targetTripId}`);
    revalidatePath('/finance/cashflow');
    revalidatePath(`/finance/cashflow/${sourceTripId}`);
    revalidatePath(`/finance/cashflow/${targetTripId}`);
    revalidatePath('/accounting');
    revalidatePath('/accounting/groups');
    revalidatePath('/invoices');

    const successCount = results.filter((r) => r.ok).length;
    const errorCount = results.filter((r) => r.error).length;

    return {
      ok: true, results,
      summary: {
        total: passengersToTransfer.length,
        success: successCount,
        errors: errorCount,
        targetTrip: targetTrip.kode_trip || targetTrip.name,
      },
    };
  } catch (e) {
    return { error: 'Transfer gagal: ' + (e?.message || 'unknown') };
  }
}

export async function undoTransfer(passengerId) {
  if (!passengerId) return { error: 'passengerId wajib' };
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data: oldPax } = await supabase
      .from('trip_passengers').select('*').eq('id', passengerId).maybeSingle();
    if (!oldPax) return { error: 'Peserta tidak ditemukan' };
    if (oldPax.transfer_status !== 'transferred') return { error: 'Peserta ini belum dipindah' };

    const newPaxId = oldPax.transferred_to_passenger_id;
    const targetTripId = oldPax.transferred_to_trip_id;

    if (newPaxId) {
      await supabase.from('participant_payments').delete().eq('passenger_id', newPaxId);
      await supabase.from('trip_passengers').delete().eq('id', newPaxId);

      try {
        await supabase.from('participant_payments').update({
          is_transferred: false,
          transferred_to_payment_id: null,
          transfer_note: null,
        }).eq('passenger_id', oldPax.id);
      } catch {}
    }

    await supabase.from('trip_passengers').update({
      transfer_status: 'active',
      transferred_to_trip_id: null,
      transferred_to_passenger_id: null,
      transferred_at: null,
      transfer_reason: null,
    }).eq('id', passengerId);

    // Recalc stats
    await recalculateTripStats(supabase, oldPax.trip_id);
    if (targetTripId) await recalculateTripStats(supabase, targetTripId);

    revalidatePath('/trips');
    revalidatePath(`/trips/${oldPax.trip_id}`);
    if (targetTripId) revalidatePath(`/trips/${targetTripId}`);
    revalidatePath('/finance/cashflow');
    revalidatePath('/accounting');

    return { ok: true };
  } catch (e) {
    return { error: 'Undo gagal: ' + (e?.message || 'unknown') };
  }
}
