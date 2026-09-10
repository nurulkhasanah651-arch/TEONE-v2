'use server';

// Kunjungan kantor harian — jumlah orang yang datang ke kantor per hari,
// per lokasi (Serpong, Bandung, Jogja). 1 baris per tanggal (upsert by tanggal).
// Dipakai di tab CS Daily. Brand-aware (tabel ada di tiap brand).

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function upsertOfficeVisits(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Belum login' };

  const tanggal = formData.get('tanggal');
  if (!tanggal) return { error: 'Tanggal harus diisi' };

  const num = (k) => Math.max(parseInt(formData.get(k)) || 0, 0);
  const fields = {
    tanggal,
    serpong: num('serpong'),
    bandung: num('bandung'),
    jogja: num('jogja'),
    notes: formData.get('notes') || null,
    updated_by: user.user_metadata?.full_name || user.email || 'unknown',
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('cs_office_visits').upsert(fields, { onConflict: 'tanggal' });
  if (error) return { error: error.message };

  revalidatePath('/cs');
  return { ok: true };
}
