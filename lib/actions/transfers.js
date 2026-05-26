'use server';

// Round 114: Transfer peserta antar trip — dengan data + payment + invoices migrate
// File: lib/actions/transfers.js

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

/**
 * Transfer satu peserta (atau seluruh family) ke trip lain.
 * Semua: data peserta, payment history, invoices ikut pindah.
 *
 * @param {Object} params
 * @param {string} params.passengerId - ID peserta yang mau dipindah
 * @param {string} params.targetTripId - ID trip tujuan
 * @param {string} params.reason - Alasan pindah (optional)
 * @param {boolean} params.transferFamily - Pindahin seluruh family bareng (kalau true)
 * @param {boolean} params.cancelUnpaidInvoices - Cancel invoice yg belum bayar
 */
export async function transferPassenger({
  passengerId,
  targetTripId,
  reason = '',
  transferFamily = false,
  cancelUnpaidInvoices = true,
}) {
  if (!passengerId || !targetTripId) {
    return { error: 'passengerId dan targetTripId wajib' };
  }
  if (passengerId === targetTripId) {
    return { error: 'Trip tujuan sama dengan trip asal' };
  }

  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set di env' };

  try {
    // 1. Fetch peserta asal
    const { data: oldPax, error: paxErr } = await supabase
      .from('trip_passengers').select('*').eq('id', passengerId).maybeSingle();
    if (paxErr || !oldPax) return { error: 'Peserta tidak ditemukan' };
    if (oldPax.trip_id === targetTripId) {
      return { error: 'Peserta sudah di trip ini' };
    }
    if (oldPax.transfer_status === 'transferred') {
      return { error: 'Peserta sudah pernah dipindah sebelumnya' };
    }

    // 2. Validate trip tujuan
    const { data: targetTrip } = await supabase
      .from('trips').select('id, name, kode_trip').eq('id', targetTripId).maybeSingle();
    if (!targetTrip) return { error: 'Trip tujuan tidak ditemukan' };

    const sourceTripId = oldPax.trip_id;

    // 3. Tentukan list peserta untuk transfer (kepala + family kalau opsi true)
    let passengersToTransfer = [oldPax];
    if (transferFamily && oldPax.family_group_id) {
      const { data: familyMembers } = await supabase
        .from('trip_passengers')
        .select('*')
        .eq('family_group_id', oldPax.family_group_id)
        .neq('transfer_status', 'transferred');
      if (familyMembers && familyMembers.length > 0) {
        passengersToTransfer = familyMembers;
      }
    }

    const results = [];
    const transferredAt = new Date().toISOString();

    // 4. Loop transfer setiap peserta
    for (const oldP of passengersToTransfer) {
      // Field yang gak boleh ikut (FK / unique / system)
      const skipFields = [
        'id', 'created_at', 'updated_at', 'trip_id',
        'family_group_id', // family lama gak relevan di trip baru
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
      newPaxData.transferred_from_passenger_id = oldP.id;
      newPaxData.transferred_at = transferredAt;
      newPaxData.transfer_reason = reason;

      const { data: newPax, error: insertErr } = await supabase
        .from('trip_passengers').insert(newPaxData).select().single();

      if (insertErr) {
        results.push({ oldId: oldP.id, oldName: oldP.name, error: insertErr.message });
        continue;
      }

      // 5. Copy participant_payments
      try {
        const { data: payments } = await supabase
          .from('participant_payments').select('*').eq('passenger_id', oldP.id);
        if (payments && payments.length > 0) {
          const newPayments = payments.map((p) => {
            const np = { ...p };
            delete np.id;
            delete np.created_at;
            np.passenger_id = newPax.id;
            np.trip_id = targetTripId;
            np.notes = (p.notes || '') + ` [Transferred from pax ${oldP.id}]`;
            return np;
          });
          await supabase.from('participant_payments').insert(newPayments);
        }
      } catch (e) {
        // log but don't fail
        results.push({ oldId: oldP.id, paymentsError: e?.message });
      }

      // 6. Handle invoices
      try {
        const { data: invoices } = await supabase
          .from('invoices').select('*').eq('passenger_id', oldP.id);
        for (const inv of (invoices || [])) {
          if (inv.status === 'paid') {
            // Invoice paid → mark as transferred, log link
            await supabase.from('invoices').update({
              notes: (inv.notes || '') + `\n[Transferred to trip ${targetTrip.kode_trip || targetTripId} pax ${newPax.name}]`,
            }).eq('id', inv.id);
          } else if (cancelUnpaidInvoices && ['sent', 'draft', 'overdue'].includes(inv.status)) {
            await supabase.from('invoices').update({
              status: 'cancelled',
              notes: (inv.notes || '') + `\n[Cancelled karena peserta pindah ke trip ${targetTrip.kode_trip || targetTripId}]`,
            }).eq('id', inv.id);
          }
        }
      } catch (e) {
        results.push({ oldId: oldP.id, invoicesError: e?.message });
      }

      // 7. Mark old passenger as transferred (soft delete)
      await supabase.from('trip_passengers').update({
        transfer_status: 'transferred',
        transferred_to_trip_id: targetTripId,
        transferred_to_passenger_id: newPax.id,
        transferred_at: transferredAt,
        transfer_reason: reason,
      }).eq('id', oldP.id);

      results.push({
        oldId: oldP.id,
        oldName: oldP.name,
        newId: newPax.id,
        ok: true,
      });
    }

    // 8. Revalidate
    revalidatePath('/trips');
    revalidatePath(`/trips/${sourceTripId}`);
    revalidatePath(`/trips/${targetTripId}`);
    revalidatePath('/finance/payments');
    revalidatePath(`/finance/payments/${sourceTripId}`);
    revalidatePath(`/finance/payments/${targetTripId}`);
    revalidatePath('/invoices');

    const successCount = results.filter((r) => r.ok).length;
    const errorCount = results.filter((r) => r.error).length;

    return {
      ok: true,
      results,
      summary: {
        total: passengersToTransfer.length,
        success: successCount,
        errors: errorCount,
        targetTrip: targetTrip.kode_trip || targetTrip.name,
      },
    };
  } catch (e) {
    return { error: 'Transfer gagal: ' + (e?.message || 'unknown error') };
  }
}

/**
 * Undo transfer — hapus peserta baru, kembalikan status peserta asal jadi active
 * Gunakan kalau salah pindah trip
 */
export async function undoTransfer(passengerId) {
  if (!passengerId) return { error: 'passengerId wajib' };

  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data: oldPax } = await supabase
      .from('trip_passengers').select('*').eq('id', passengerId).maybeSingle();
    if (!oldPax) return { error: 'Peserta tidak ditemukan' };
    if (oldPax.transfer_status !== 'transferred') {
      return { error: 'Peserta ini belum pernah dipindah' };
    }

    const newPaxId = oldPax.transferred_to_passenger_id;
    if (newPaxId) {
      // Hapus payments yg di-transfer
      await supabase.from('participant_payments').delete().eq('passenger_id', newPaxId);
      // Hapus peserta baru
      await supabase.from('trip_passengers').delete().eq('id', newPaxId);
    }

    // Kembalikan status peserta asal
    await supabase.from('trip_passengers').update({
      transfer_status: 'active',
      transferred_to_trip_id: null,
      transferred_to_passenger_id: null,
      transferred_at: null,
      transfer_reason: null,
    }).eq('id', passengerId);

    revalidatePath('/trips');
    revalidatePath(`/trips/${oldPax.trip_id}`);
    if (oldPax.transferred_to_trip_id) {
      revalidatePath(`/trips/${oldPax.transferred_to_trip_id}`);
    }

    return { ok: true };
  } catch (e) {
    return { error: 'Undo gagal: ' + (e?.message || 'unknown') };
  }
}
