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

// Penerima dikelompokkan per KELUARGA (per nomor kontak = unit kirim).
export async function getBlastRecipients(tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/blast');
  if (g.error) return { error: g.error };
  if (!tripId) return { error: 'Trip belum dipilih.' };

  const { data: pax } = await supabase.from('trip_passengers')
    .select('id, customer_id, status, transfer_status, refund_status, is_family_head').eq('trip_id', tripId);
  const active = (pax || []).filter(paxActive).filter((p) => p.customer_id);
  const ids = [...new Set(active.map((p) => p.customer_id))];
  const custMap = {};
  if (ids.length) {
    const { data: cs } = await supabase.from('customers').select('id, name, phone').in('id', ids);
    for (const c of (cs || [])) custMap[c.id] = c;
  }
  const recipients = active.map((p) => {
    const c = custMap[p.customer_id] || {};
    const ph = norm(c.phone);
    const valid = !!(ph && ph.length >= 9);
    return { id: p.id, name: c.name || '(tanpa nama)', phone: valid ? ph : '', hasPhone: valid, isHead: !!p.is_family_head };
  });
  // grup per nomor (keluarga). Tanpa nomor -> grup sendiri (disabled).
  const byKey = {};
  for (const r of recipients) {
    const key = r.hasPhone ? ('ph:' + r.phone) : ('np:' + r.id);
    (byKey[key] = byKey[key] || { key, phone: r.phone, hasPhone: r.hasPhone, members: [] }).members.push(r);
  }
  const families = Object.values(byKey).map((grp) => {
    const head = grp.members.find((m) => m.isHead) || grp.members[0];
    return {
      key: grp.key, phone: grp.phone, hasPhone: grp.hasPhone, headName: head.name,
      memberIds: grp.members.map((m) => m.id),
      members: grp.members.map((m) => ({ id: m.id, name: m.name })),
      count: grp.members.length,
    };
  });
  families.sort((a, b) => (b.count - a.count) || String(a.headName).localeCompare(String(b.headName)));
  const noPhone = recipients.filter((r) => !r.hasPhone).length;
  return { ok: true, recipients, families, noPhone, total: recipients.length };
}

// Kirim blast ke peserta terpilih (selectedIds = id peserta). 1 pesan per nomor (keluarga),
// sapaan {{nama}} pakai nama kepala keluarga. Kalau selectedIds kosong -> semua yg punya nomor.
export async function sendBlast(tripId, message, selectedIds) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/blast');
  if (g.error) return { error: g.error };
  const msg = String(message || '').trim();
  if (!msg) return { error: 'Pesan kosong.' };

  const r = await getBlastRecipients(tripId);
  if (r.error) return r;

  const sel = Array.isArray(selectedIds) && selectedIds.length ? new Set(selectedIds.map(String)) : null;
  let pool = r.recipients.filter((x) => x.hasPhone);
  if (sel) pool = pool.filter((x) => sel.has(String(x.id)));
  if (!pool.length) return { error: 'Tidak ada penerima terpilih dengan nomor valid.' };

  // kumpulkan per nomor -> 1 pesan; nama = kepala keluarga
  const byPhone = {};
  for (const rc of pool) (byPhone[rc.phone] = byPhone[rc.phone] || []).push(rc);

  const brand = getBrandCode();
  let sent = 0, failed = 0;
  for (const phone of Object.keys(byPhone)) {
    const arr = byPhone[phone];
    const head = arr.find((x) => x.isHead) || arr[0];
    const first = (String(head.name).trim().split(/\s+/)[0]) || 'Kak';
    const personalized = msg.replace(/\{\{\s*nama\s*\}\}/gi, first);
    const res = await sendFonnte(phone, personalized, { context: 'cs', brand });
    if (res?.ok) sent++;
    else {
      failed++;
      try { await logFailedWA({ context: 'cs', phone, message: personalized, kind: 'blast', reason: res?.error || 'gagal' }); } catch {}
    }
  }
  return { ok: true, sent, failed, contacts: Object.keys(byPhone).length };
}
