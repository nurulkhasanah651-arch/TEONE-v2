'use server';

// Modul Mitra (partner/agen). Brand-aware.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

function normPhone(p) { return String(p || '').replace(/\D/g, '').replace(/^0/, '62'); }

// ---- Mitra self-register (login Google, dicocokkan no HP) ----
export async function registerAsMitra(formData) {
  const name = (formData.get('name') || '').trim();
  const phone = (formData.get('phone') || '').trim();
  if (!name || !phone) return { error: 'Nama & No HP wajib' };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const np = normPhone(phone);
  // cari mitra terdaftar dgn no HP cocok
  const { data: all } = await supabase.from('mitra').select('*');
  const match = (all || []).find((m) => normPhone(m.phone) === np);
  if (!match) {
    return { error: 'Nomor HP belum terdaftar sebagai mitra. Hubungi admin untuk didaftarkan dulu.' };
  }
  // link akun + set role
  await supabase.from('mitra').update({
    user_id: user.id, email: user.email || match.email, name: match.name || name,
  }).eq('id', match.id);
  await supabase.from('users').upsert({ id: user.id, email: user.email, name: match.name || name, role: 'mitra' }, { onConflict: 'id' });
  await supabase.auth.updateUser({ data: { ...user.user_metadata, role: 'mitra' } });
  return { ok: true, redirect: '/mitra' };
}

// ---- Admin: kelola mitra ----
export async function saveMitra(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const id = formData.get('id');
  const payload = {
    name: (formData.get('name') || '').trim(),
    phone: (formData.get('phone') || '').trim() || null,
    email: (formData.get('email') || '').trim() || null,
    notes: (formData.get('notes') || '').trim() || null,
    active: formData.get('active') !== 'false',
    updated_at: new Date().toISOString(),
  };
  if (!payload.name) return { error: 'Nama wajib' };
  let err;
  if (id) ({ error: err } = await supabase.from('mitra').update(payload).eq('id', id));
  else ({ error: err } = await supabase.from('mitra').insert(payload));
  if (err) return { error: err.message };
  revalidatePath('/mitra-master');
  return { ok: true };
}

export async function saveFeeTemplate(rows) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  for (const r of rows || []) {
    if (!r.category) continue;
    await supabase.from('mitra_fee_template').upsert(
      { category: r.category, fee: Number(r.fee) || 0, updated_at: new Date().toISOString() },
      { onConflict: 'category,brand_id' }
    );
  }
  revalidatePath('/mitra-master');
  return { ok: true };
}

// ---- Hitung fee per mitra ----
export async function getMitraStats() {
  const supabase = createClient();
  try {
    const [{ data: mitras }, { data: tpl }, { data: payouts }] = await Promise.all([
      supabase.from('mitra').select('*').order('name'),
      supabase.from('mitra_fee_template').select('*'),
      supabase.from('mitra_fee_payouts').select('*'),
    ]);
    const feeByCat = Object.fromEntries((tpl || []).map((t) => [t.category, Number(t.fee) || 0]));

    // peserta yg di-attribute ke mitra (aktif)
    const { data: pax } = await supabase
      .from('trip_passengers')
      .select('id, trip_id, mitra_id, transfer_status, refund_status')
      .not('mitra_id', 'is', null);
    const tripIds = [...new Set((pax || []).map((p) => p.trip_id).filter(Boolean))];
    let tripMap = {};
    if (tripIds.length) {
      const { data: trips } = await supabase.from('trips').select('id, name, kode_trip, fee_category').in('id', tripIds);
      tripMap = Object.fromEntries((trips || []).map((t) => [t.id, t]));
    }

    const stats = (mitras || []).map((m) => {
      const myPax = (pax || []).filter((p) => p.mitra_id === m.id
        && p.transfer_status !== 'transferred'
        && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund');
      const trips = {};
      let feeEarned = 0;
      for (const p of myPax) {
        const t = tripMap[p.trip_id];
        const cat = t?.fee_category || 'Lainnya';
        feeEarned += feeByCat[cat] || 0;
        const key = p.trip_id;
        if (!trips[key]) trips[key] = { name: t ? `${t.kode_trip || ''} ${t.name}` : p.trip_id, count: 0, cat };
        trips[key].count++;
      }
      const paid = (payouts || []).filter((p) => p.mitra_id === m.id).reduce((s, p) => s + (Number(p.amount) || 0), 0);
      return {
        ...m, sold: myPax.length, trips: Object.values(trips),
        feeEarned, paid, remaining: Math.max(feeEarned - paid, 0),
        payouts: (payouts || []).filter((p) => p.mitra_id === m.id),
      };
    });
    return { ok: true, stats, feeByCat };
  } catch (e) {
    return { error: e?.message || 'gagal' };
  }
}

export async function payoutMitraFee(mitraId, amount, period, notes) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  if (!mitraId || !(Number(amount) > 0)) return { error: 'Mitra & jumlah wajib' };
  const { error } = await supabase.from('mitra_fee_payouts').insert({
    mitra_id: mitraId, amount: Number(amount), period: period || null,
    paid_by: user.user_metadata?.full_name || user.email || 'unknown', notes: notes || null,
  });
  if (error) return { error: error.message };
  // catat sebagai pengeluaran accounting (tanpa trip)
  try {
    await supabase.from('accounting_entries').insert({
      type: 'out', amount: Number(amount), category: 'Fee Mitra',
      description: `Pencairan fee mitra #${mitraId}${period ? ` periode ${period}` : ''}`,
      date: new Date().toISOString().slice(0, 10),
      created_by: user.email || 'system',
    });
  } catch {}
  revalidatePath('/mitra-master');
  revalidatePath('/accounting');
  return { ok: true };
}

// ---- Portal mitra: trip open selling ----
export async function getOpenTripsForMitra() {
  const supabase = createClient();
  try {
    const { data: trips } = await supabase
      .from('trips')
      .select('id, name, kode_trip, departure, harga_jual, price, quota, seat_left, status, visa_pdf_syarat_url, trip_docs_link, fee_category')
      .order('departure', { ascending: true });
    const open = (trips || []).filter((t) => /open\s*selling/i.test(t.status || ''));
    // hitung sisa seat riil dari peserta aktif
    const ids = open.map((t) => t.id);
    let soldMap = {};
    if (ids.length) {
      const { data: pax } = await supabase.from('trip_passengers').select('trip_id, transfer_status, refund_status').in('trip_id', ids);
      for (const p of pax || []) {
        if (p.transfer_status === 'transferred' || p.refund_status === 'refunded' || p.refund_status === 'partial_refund') continue;
        soldMap[p.trip_id] = (soldMap[p.trip_id] || 0) + 1;
      }
    }
    return { ok: true, trips: open.map((t) => ({
      id: t.id, name: t.name, kode_trip: t.kode_trip, departure: t.departure,
      price: t.harga_jual || t.price || 0, quota: t.quota || 0,
      seat_left: Math.max((t.quota || 0) - (soldMap[t.id] || 0), 0),
      pdf: t.trip_docs_link || t.visa_pdf_syarat_url || null,
    })) };
  } catch (e) {
    return { error: e?.message || 'gagal' };
  }
}
