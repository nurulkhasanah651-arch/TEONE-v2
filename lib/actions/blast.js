'use server';
// Blast WA ke semua peserta aktif satu trip. Nomor pengirim: CS. Personalisasi {{nama}}.
import { createClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { getBrandCode } from '@/lib/brand';
import { sendFonnte } from '@/lib/utils/fonnte';
import { assertStaff } from '@/lib/auth/require-staff';
import { logFailedWA } from '@/lib/wa-outbox-log';

const norm = (p) => {
  let s = String(p || '').replace(/[^0-9]/g, '');
  if (s.startsWith('0')) s = '62' + s.slice(1);
  if (s.startsWith('620')) s = '62' + s.slice(3);
  return s;
};
function paxActive(p) {
  return p.status !== 'cancelled' && p.transfer_status !== 'transferred'
    && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund';
}

// Daftar trip (yang punya peserta aktif) untuk pemilih blast
export async function listBlastTrips() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/blast');
  if (g.error) return { error: g.error };

  const [{ data: trips }, pax] = await Promise.all([
    supabase.from('trips').select('id, name, kode_trip, departure, status').order('departure', { ascending: false, nullsFirst: false }),
    fetchAll(() => supabase.from('trip_passengers').select('trip_id, status, transfer_status, refund_status')),
  ]);
  const cnt = {};
  for (const p of (pax || [])) if (paxActive(p)) cnt[p.trip_id] = (cnt[p.trip_id] || 0) + 1;
  const list = (trips || [])
    .map((t) => ({ id: t.id, kode: t.kode_trip || t.name, name: t.name, departure: t.departure, status: t.status, pax: cnt[t.id] || 0 }))
    .filter((t) => t.pax > 0);
  return { ok: true, trips: list };
}

// Penerima aktif (dedup per nomor) + hitung yang tak punya nomor valid
export async function getBlastRecipients(tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/blast');
  if (g.error) return { error: g.error };
  if (!tripId) return { error: 'Trip belum dipilih.' };

  const { data: pax } = await supabase.from('trip_passengers')
    .select('id, customer_id, status, transfer_status, refund_status').eq('trip_id', tripId);
  const active = (pax || []).filter(paxActive).filter((p) => p.customer_id);
  const ids = [...new Set(active.map((p) => p.customer_id))];
  const custMap = {};
  if (ids.length) {
    const { data: cs } = await supabase.from('customers').select('id, name, phone').in('id', ids);
    for (const c of (cs || [])) custMap[c.id] = c;
  }
  const seen = new Set();
  const recipients = [];
  let noPhone = 0;
  for (const p of active) {
    const c = custMap[p.customer_id];
    if (!c) { noPhone++; continue; }
    const ph = norm(c.phone);
    if (!ph || ph.length < 9) { noPhone++; continue; }
    if (seen.has(ph)) continue;
    seen.add(ph);
    recipients.push({ name: c.name || '', phone: ph });
  }
  return { ok: true, recipients, noPhone, total: active.length };
}

// Kirim blast. message boleh mengandung {{nama}} -> diganti nama depan tiap peserta.
export async function sendBlast(tripId, message) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/blast');
  if (g.error) return { error: g.error };
  const msg = String(message || '').trim();
  if (!msg) return { error: 'Pesan kosong.' };

  const r = await getBlastRecipients(tripId);
  if (r.error) return r;
  if (!r.recipients.length) return { error: 'Tidak ada penerima dengan nomor valid.' };

  const brand = getBrandCode();
  let sent = 0, failed = 0;
  for (const rc of r.recipients) {
    const first = (String(rc.name).trim().split(/\s+/)[0]) || 'Kak';
    const personalized = msg.replace(/\{\{\s*nama\s*\}\}/gi, first);
    const res = await sendFonnte(rc.phone, personalized, { context: 'cs', brand });
    if (res?.ok) sent++;
    else {
      failed++;
      try { await logFailedWA({ context: 'cs', phone: rc.phone, message: personalized, kind: 'blast', reason: res?.error || 'gagal' }); } catch {}
    }
  }
  return { ok: true, sent, failed, noPhone: r.noPhone, total: r.total };
}
