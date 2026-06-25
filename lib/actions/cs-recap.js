'use server';

// Rekap Harian CS — generate dari data trip + closingan, kirim ke grup WA (Fonnte)
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { sendFonnte } from '@/lib/utils/fonnte';
import { fetchAll } from '@/lib/supabase/fetch-all';

const GROUP_KEY = 'cs_recap_wa_group';
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false } });
}
function todayStr() {
  // HARI BISNIS CS: laporan ditutup jam 18:00 WIB.
  // closing setelah 18:00 WIB masuk laporan hari berikutnya.
  // WIB (+7j) + geser 6j -> jam 18:00 jadi pergantian hari.
  const d = new Date(Date.now() + 13 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}
// Jendela hari bisnis untuk tanggal D (string YYYY-MM-DD): [D-1 18:00 WIB, D 18:00 WIB)
function businessWindow(dStr) {
  const start = new Date(`${dStr}T00:00:00+07:00`).getTime() - 6 * 3600 * 1000;
  return { startISO: new Date(start).toISOString(), endISO: new Date(start + 24 * 3600 * 1000).toISOString() };
}
function tanggalIndo(dStr) {
  const d = new Date(dStr + 'T00:00:00');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function num(n) { return Number(n || 0); }
function dash(n) { return num(n) > 0 ? num(n) : '-'; }

export async function getCsRecapGroup() {
  const supabase = svc() || createClient();
  const { data } = await supabase.from('app_settings').select('value').eq('key', GROUP_KEY).maybeSingle();
  return { group: data?.value || '' };
}

export async function buildCsRecap() {
 try {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const today = todayStr();

  const [{ data: trips }, { data: updates }, { data: leads }, paxRowsAll] = await Promise.all([
    supabase.from('trips').select('id, kode_trip, name, departure, quota, seat_left, sold, status').order('departure', { ascending: true, nullsFirst: false }),
    supabase.from('cs_daily_updates').select('*').eq('tanggal', today),
    supabase.from('cs_daily_leads').select('*').eq('tanggal', today).maybeSingle(),
    fetchAll(() => supabase.from('trip_passengers').select('trip_id, transfer_status, refund_status')),
  ]);

  // Hitung peserta LIVE (asli) per trip — sama dgn Master Trip & web (exclude transfer/refund).
  const liveCnt = {};
  for (const p of (paxRowsAll || [])) {
    if (p.transfer_status === 'transferred') continue;
    if (p.refund_status === 'refunded' || p.refund_status === 'partial_refund') continue;
    liveCnt[p.trip_id] = (liveCnt[p.trip_id] || 0) + 1;
  }

  const up = updates || [];
  // CLOSING HARI INI per trip (WIB): web (booking lunas hari ini) + channel manual CS.
  const webByTrip = {};
  let webTotal = 0;
  try {
    const db2 = svc();
    if (db2) {
      const { startISO, endISO } = businessWindow(today);
      const { data: paidB } = await db2.from('bookings')
        .select('trip_id, pax_count, paid_at, status')
        .eq('status', 'paid')
        .gte('paid_at', startISO)
        .lt('paid_at', endISO);
      for (const b of (paidB || [])) {
        const px = Number(b.pax_count) || 0;
        webTotal += px;
        if (b.trip_id) webByTrip[b.trip_id] = (webByTrip[b.trip_id] || 0) + px;
      }
    }
  } catch {}
  const manualClose = (u) => num(u.from_whatsapp) + num(u.from_instagram) + num(u.from_offline)
    + num(u.closing_alumni) + num(u.closing_mitra) + num(u.from_ads_meta) + num(u.from_ads_google) + num(u.from_ads_tiktok);
  const closeTodayByTrip = {};
  for (const u of up) { if (u.trip_id) closeTodayByTrip[u.trip_id] = (closeTodayByTrip[u.trip_id] || 0) + manualClose(u); }
  for (const tid of Object.keys(webByTrip)) { closeTodayByTrip[tid] = (closeTodayByTrip[tid] || 0) + webByTrip[tid]; }

  const activeTrips = (trips || []).filter((t) => {
    if (t.status === 'completed' || t.status === 'cancelled' || !t.departure) return false;
    const liveSold = liveCnt[t.id] || 0;
    const avail = Math.max((t.quota || 0) - liveSold, 0);
    // Sembunyikan trip penuh KECUALI ada closing hari ini (biar total bisa ditelusuri).
    return avail > 0 || (closeTodayByTrip[t.id] || 0) > 0;
  });

  // Group per bulan keberangkatan
  const byMonth = {};
  for (const t of activeTrips) {
    const d = new Date(t.departure);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    (byMonth[key] = byMonth[key] || []).push(t);
  }

  const lead = leads || {};
  const organic = num(lead.leads_ig) + num(lead.leads_tiktok) + num(lead.leads_wa) + num(lead.leads_fb);
  const adsLeads = num(lead.leads_ads_meta) + num(lead.leads_ads_google) + num(lead.leads_ads_tiktok);
  const totalChat = organic + adsLeads;

  const sum = (f) => up.reduce((s, u) => s + num(u[f]), 0);
  // Sumber closing sesuai kolom yang BENAR-BENAR diisi form CS (+ web dari fulfillment)
  const ig = sum('from_instagram');
  const wa = sum('from_whatsapp');
  const offline = sum('from_offline');
  const alumni = sum('closing_alumni');
  const mitra = sum('closing_mitra');
  const web = webTotal; // closing web hari ini (live, WIB) — dihitung di atas
  const adsMeta = sum('from_ads_meta');
  const adsGoogle = sum('from_ads_google');
  const adsTiktok = sum('from_ads_tiktok');
  const newAds = adsMeta + adsGoogle + adsTiktok;
  const closingOrganic = ig + wa + offline + alumni + mitra + web;
  // Total = semua sumber (organic termasuk web + ads). Tidak pakai total_terjual_hari_ini
  // agar manual & web sama-sama terhitung tanpa dobel.
  const totalClosing = closingOrganic + newAds;

  // Susun teks
  let txt = `*${tanggalIndo(today).toUpperCase()}*\n`;
  txt += `Total Chat  ${totalChat || '-'}\n`;
  txt += `ADS  ${dash(adsLeads)}\n`;
  txt += `Non ADS  ${dash(organic)}\n`;
  txt += `====================`;

  const sortedMonths = Object.keys(byMonth).sort();
  for (const mk of sortedMonths) {
    const [y, m] = mk.split('-');
    txt += `\n🕋*Trip ${MONTHS[parseInt(m) - 1]}*`;
    for (const t of byMonth[mk]) {
      const liveSold = liveCnt[t.id] || 0;
      const closing = dash(liveSold);
      const avail = `${Math.max(num(t.quota) - liveSold, 0)}/${num(t.quota)}`;
      txt += `\nTrip ${t.kode_trip || t.id} ${t.name || ''}`.trimEnd();
      txt += `\nSeat terisi : ${closing}`;
      txt += `\nAvailibility : ${avail}`;
      txt += `\nClosing hari ini : ${dash(closeTodayByTrip[t.id] || 0)}`;
    }
  }

  txt += `\n=============================================`;
  txt += `\nADS : ${dash(newAds)}`;
  txt += `\nIG 📷 : ${dash(ig)}`;
  txt += `\nWA 💬 : ${dash(wa)}`;
  txt += `\nOffline 🏪 : ${dash(offline)}`;
  txt += `\nAlumni 🎓 : ${dash(alumni)}`;
  txt += `\nMitra 🤝 : ${dash(mitra)}`;
  txt += `\nWeb 🌐 : ${dash(web)}`;
  txt += `\n*Total closing : ${totalClosing}*`;

  return { ok: true, text: txt };
 } catch (e) {
  return { error: 'Gagal generate rekap: ' + (e?.message || 'unknown') };
 }
}

export async function sendCsRecap(text, groupTarget) {
 try {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const role = user.app_metadata?.role || user.user_metadata?.role || user.app_metadata?.role || null;
  if (!['owner', 'accounting', 'manager', 'cs', 'ops'].includes(role)) {
    return { error: 'Role kamu tidak boleh kirim rekap' };
  }
  const target = String(groupTarget || '').trim();
  if (!target) return { error: 'ID grup WA belum diisi' };
  if (!text || !text.trim()) return { error: 'Teks rekap kosong' };

  // Simpan group id untuk brand ini
  const supabase = svc() || authClient;
  try {
    await supabase.from('app_settings').upsert(
      { key: GROUP_KEY, value: target, updated_at: new Date().toISOString(), updated_by: user.email || 'cs' },
      { onConflict: 'key' }
    );
  } catch {}

  const res = await sendFonnte(target, text, { context: 'finance', rawTarget: true });
  if (res.error) return { error: res.error };
  return { ok: true };
 } catch (e) {
  return { error: 'Gagal kirim rekap: ' + (e?.message || 'unknown') };
 }
}
