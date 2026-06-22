'use server';

// Rekap Harian CS — generate dari data trip + closingan, kirim ke grup WA (Fonnte)
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { sendFonnte } from '@/lib/utils/fonnte';

const GROUP_KEY = 'cs_recap_wa_group';
const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false } });
}
function todayStr() {
  // WIB (UTC+7)
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
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

  const [{ data: trips }, { data: updates }, { data: leads }, { data: paxRows }] = await Promise.all([
    supabase.from('trips').select('id, kode_trip, name, departure, quota, seat_left, sold, status').order('departure', { ascending: true, nullsFirst: false }),
    supabase.from('cs_daily_updates').select('*').eq('tanggal', today),
    supabase.from('cs_daily_leads').select('*').eq('tanggal', today).maybeSingle(),
    supabase.from('trip_passengers').select('trip_id, transfer_status, refund_status'),
  ]);

  // Hitung peserta LIVE (asli) per trip — sama dgn Master Trip & web (exclude transfer/refund).
  const liveCnt = {};
  for (const p of (paxRows || [])) {
    if (p.transfer_status === 'transferred') continue;
    if (p.refund_status === 'refunded' || p.refund_status === 'partial_refund') continue;
    liveCnt[p.trip_id] = (liveCnt[p.trip_id] || 0) + 1;
  }

  const activeTrips = (trips || []).filter((t) => {
    if (t.status === 'completed' || t.status === 'cancelled' || !t.departure) return false;
    // Sembunyikan trip yang sudah PENUH (sisa seat 0) dari rekap WA.
    const liveSold = liveCnt[t.id] || 0;
    return Math.max((t.quota || 0) - liveSold, 0) > 0;
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

  const up = updates || [];
  const sum = (f) => up.reduce((s, u) => s + num(u[f]), 0);
  // Sumber closing sesuai kolom yang BENAR-BENAR diisi form CS (+ web dari fulfillment)
  const ig = sum('from_instagram');
  const wa = sum('from_whatsapp');
  const offline = sum('from_offline');
  const alumni = sum('closing_alumni');
  const mitra = sum('closing_mitra');
  // Closing WEB hari ini dihitung LIVE dari booking lunas (rentang WIB), supaya akurat
  // & tak meleset gara-gara beda tanggal UTC/WIB pada cs_daily_updates.
  let web = sum('from_website');
  try {
    const db2 = svc();
    if (db2) {
      const startWib = new Date(`${today}T00:00:00+07:00`);
      const endWib = new Date(startWib.getTime() + 24 * 3600 * 1000);
      const { data: paidB } = await db2.from('bookings')
        .select('pax_count, paid_at, status')
        .eq('status', 'paid')
        .gte('paid_at', startWib.toISOString())
        .lt('paid_at', endWib.toISOString());
      const webPax = (paidB || []).reduce((acc, b) => acc + (Number(b.pax_count) || 0), 0);
      web = webPax;
    }
  } catch {}
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
