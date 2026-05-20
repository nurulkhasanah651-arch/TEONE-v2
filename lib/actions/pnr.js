'use server';

// MINIMAL PNR action — diagnostic. Insert only `pnr` to see if any insert works.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function createPnr(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const pnr = (formData.get('pnr') || '').trim();
  if (!pnr) return { error: 'PNR code wajib diisi' };

  // ULTRA-MINIMAL insert — only column 'pnr'. If THIS fails, table is broken.
  const { error, data } = await supabase
    .from('flight_inventory')
    .insert({ pnr })
    .select('id')
    .single();

  if (error) {
    return { error: `MINIMAL INSERT FAILED: ${error.message} (code: ${error.code})` };
  }

  // Now try to UPDATE with other fields, gracefully handling missing columns
  const updates = {};
  const route = (formData.get('route') || '').trim();
  if (route) updates.route = route;
  const vendor = (formData.get('vendor') || '').trim();
  if (vendor) updates.vendor = vendor;
  const deposit_total = parseInt(formData.get('deposit_total'));
  if (Number.isFinite(deposit_total) && deposit_total > 0) updates.deposit_total = deposit_total;
  const payoff_amount = parseInt(formData.get('payoff_amount'));
  if (Number.isFinite(payoff_amount) && payoff_amount > 0) updates.payoff_amount = payoff_amount;
  const payoff_date = formData.get('payoff_date');
  if (payoff_date) updates.payoff_date = payoff_date;
  const payoff_due_date = formData.get('payoff_due_date');
  if (payoff_due_date) updates.payoff_due_date = payoff_due_date;
  const notes = (formData.get('notes') || '').trim();
  if (notes) updates.vendor_notes = notes;

  if (Object.keys(updates).length > 0) {
    const { error: upErr } = await supabase.from('flight_inventory').update(updates).eq('id', data.id);
    if (upErr) {
      // Don't fail — PNR was created, just couldn't update some fields
      console.error('PNR update partial:', upErr.message);
      return { error: `PNR ${pnr} dibuat dengan ID ${data.id}, tapi UPDATE gagal: ${upErr.message}` };
    }
  }

  revalidatePath('/finance/pnr');
  revalidatePath('/finance');
  redirect('/finance/pnr');
}

export async function updatePnr(id, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const updates = {};
  const pnr = (formData.get('pnr') || '').trim();
  if (pnr) updates.pnr = pnr;
  const route = (formData.get('route') || '').trim();
  if (route) updates.route = route;
  const vendor = (formData.get('vendor') || '').trim();
  if (vendor) updates.vendor = vendor;
  const deposit_total = parseInt(formData.get('deposit_total'));
  if (Number.isFinite(deposit_total)) updates.deposit_total = deposit_total;
  const payoff_amount = parseInt(formData.get('payoff_amount'));
  if (Number.isFinite(payoff_amount)) updates.payoff_amount = payoff_amount;
  const payoff_date = formData.get('payoff_date');
  if (payoff_date) updates.payoff_date = payoff_date;
  const payoff_due_date = formData.get('payoff_due_date');
  if (payoff_due_date) updates.payoff_due_date = payoff_due_date;
  const notes = (formData.get('notes') || '').trim();
  if (notes) updates.vendor_notes = notes;

  if (!updates.pnr) return { error: 'PNR code wajib diisi' };

  const { error } = await supabase.from('flight_inventory').update(updates).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/finance/pnr');
  revalidatePath('/finance');
  redirect('/finance/pnr');
}

export async function deletePnr(id) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: pnr } = await supabase.from('flight_inventory').select('trip_id, pnr').eq('id', id).maybeSingle();
  if (pnr?.trip_id) {
    return { error: `PNR ${pnr.pnr} masih terhubung ke trip ${pnr.trip_id}. Unlink dulu.` };
  }

  const { error } = await supabase.from('flight_inventory').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/finance/pnr');
  revalidatePath('/finance');
  return { ok: true };
}

export async function convertPnrToTrip(id) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: pnr, error: pErr } = await supabase.from('flight_inventory').select('*').eq('id', id).maybeSingle();
  if (pErr || !pnr) return { error: 'PNR not found' };
  if (pnr.trip_id) return { error: 'PNR sudah terhubung ke trip lain' };

  const { generateTripId } = await import('@/lib/utils/id');
  let trip_id;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateTripId();
    const { data: existing } = await supabase.from('trips').select('id').eq('id', candidate).maybeSingle();
    if (!existing) { trip_id = candidate; break; }
  }
  if (!trip_id) return { error: 'Gagal generate trip ID, coba lagi' };

  const { error: tErr } = await supabase.from('trips').insert({
    id: trip_id,
    name: `Trip dari PNR ${pnr.pnr}`,
    pnr: pnr.pnr,
    flight_details: pnr.route,
    status: 'prepare to sell',
    ticket: 'GROUP',
    sold: 0,
  });
  if (tErr) return { error: 'Gagal create trip: ' + tErr.message };

  await supabase.from('flight_inventory').update({ trip_id }).eq('id', id);

  revalidatePath('/finance/pnr');
  revalidatePath('/trips');
  revalidatePath('/finance');
  redirect(`/trips/${trip_id}/edit`);
}

export async function unlinkPnrFromTrip(id) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.from('flight_inventory').update({ trip_id: null }).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/finance/pnr');
  return { ok: true };
}
