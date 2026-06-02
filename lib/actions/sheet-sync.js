'use server';

// Round 189 Fase 1: Server actions buat sync trip data → Google Sheet
// Path: lib/actions/sheet-sync.js

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  createSheet,
  makeSheetShareable,
  writeTab,
  formatTab,
  getSheetsClient,
  getServiceAccountEmail,
} from '@/lib/utils/google-sheets';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function fmt(v) { return v == null ? '' : String(v); }
function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
}
function fmtDateTime(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return d; }
}

// ============ CREATE NEW BACKUP SHEET ============
export async function createBackupSheet(tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceSupabase() || authClient;

  try {
    const { data: trip } = await supabase.from('trips').select('id, kode_trip, name, sheet_id').eq('id', tripId).maybeSingle();
    if (!trip) return { error: 'Trip gak ditemukan' };
    if (trip.sheet_id) return { error: 'Trip ini udah punya Sheet. Pakai tombol Sync Now untuk update.' };

    const sheetTitle = `TEONE Backup — ${trip.kode_trip || trip.id} — ${trip.name || 'Trip'}`;
    const { sheet_id, url } = await createSheet(sheetTitle);
    await makeSheetShareable(sheet_id, 'reader'); // anyone with link can VIEW

    await supabase
      .from('trips')
      .update({ sheet_id, sheet_url: url, last_sheet_sync_at: null, sheet_sync_error: null })
      .eq('id', tripId);

    // Initial sync — populate data
    const syncResult = await syncTripToSheet(tripId);
    if (syncResult.error) {
      return { ok: true, sheet_id, url, warning: 'Sheet dibuat tapi sync awal gagal: ' + syncResult.error };
    }

    revalidatePath(`/trips/${tripId}`);
    return { ok: true, sheet_id, url };
  } catch (e) {
    const msg = e?.message || String(e);
    return { error: msgFriendly(msg) };
  }
}

function msgFriendly(msg) {
  if (/GOOGLE_SHEETS_SA_KEY/.test(msg)) return '⚠ Env GOOGLE_SHEETS_SA_KEY belum di-set di Vercel. Cek README setup.';
  if (/invalid_grant|invalid_client/.test(msg)) return '⚠ Service Account JSON invalid. Cek lagi env GOOGLE_SHEETS_SA_KEY.';
  if (/api has not been used|disabled|forbidden/i.test(msg)) return '⚠ Google Sheets API atau Drive API belum di-enable di Google Cloud Console.';
  if (/quota|rate/i.test(msg)) return '⚠ Quota Google API habis. Tunggu 1 menit, coba lagi.';
  return 'Error: ' + msg.slice(0, 200);
}

// ============ SYNC TRIP DATA TO SHEET (1-WAY: TEONE → Sheet) ============
export async function syncTripToSheet(tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceSupabase() || authClient;

  try {
    const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
    if (!trip) return { error: 'Trip gak ditemukan' };
    if (!trip.sheet_id) return { error: 'Trip belum punya Sheet. Klik "Buat Backup Sheet" dulu.' };

    // ============ FETCH ALL DATA ============
    const [
      { data: passengers },
      { data: pnrs },
      { data: items },
    ] = await Promise.all([
      supabase.from('trip_passengers').select('*').eq('trip_id', tripId).order('joined_at', { ascending: true }),
      supabase.from('flight_inventory').select('*').eq('trip_id', tripId),
      supabase.from('trip_finance_items').select('*').eq('trip_id', tripId).order('created_at', { ascending: true }),
    ]);

    const paxList = passengers || [];
    const paxIds = paxList.map((p) => p.id);
    const custIds = paxList.map((p) => p.customer_id).filter(Boolean);

    let customers = [];
    if (custIds.length > 0) {
      const { data: c } = await supabase.from('customers').select('*').in('id', custIds);
      customers = c || [];
    }
    const custMap = Object.fromEntries(customers.map((c) => [c.id, c]));

    let passports = [];
    try {
      const { data: pp } = await supabase.from('passports').select('*').in('passenger_id', paxIds);
      passports = pp || [];
    } catch {}
    const passportMap = Object.fromEntries(passports.map((p) => [p.passenger_id, p]));

    let payments = [];
    if (paxIds.length > 0) {
      const { data: pay } = await supabase.from('participant_payments').select('*').in('passenger_id', paxIds);
      payments = pay || [];
    }

    let familyGroups = [];
    try {
      const { data: fg } = await supabase.from('family_groups').select('*').eq('trip_id', tripId);
      familyGroups = fg || [];
    } catch {}
    const fgMap = Object.fromEntries(familyGroups.map((g) => [g.id, g]));

    // ============ BUILD TAB DATA ============

    // TAB 1: PESERTA
    const pesertaRows = [
      ['ID', 'Nama', 'Email', 'Phone', 'WhatsApp', 'Room Type', 'Age Type', 'Family Group', 'Kepala Family', 'Harga (Rp)', 'Joined At'],
      ...paxList.map((p) => {
        const c = custMap[p.customer_id] || {};
        const fg = fgMap[p.family_group_id];
        return [
          fmt(p.id), fmt(c.name), fmt(c.email), fmt(c.phone), fmt(c.whatsapp),
          fmt(p.room_type), fmt(p.age_type),
          fmt(fg?.name), p.is_family_head ? '👑 YES' : '',
          fmt(p.price_paid), fmtDateTime(p.joined_at),
        ];
      }),
    ];

    // TAB 2: PASSPORT
    const passportRows = [
      ['Pax ID', 'Nama', 'Passport No', 'Nationality', 'Country of Issue', 'Issue Date', 'Expiry Date', 'Place of Birth', 'Date of Birth', 'Photo URL'],
      ...paxList.map((p) => {
        const c = custMap[p.customer_id] || {};
        const pp = passportMap[p.id] || {};
        return [
          fmt(p.id), fmt(c.name),
          fmt(pp.passport_no), fmt(pp.nationality), fmt(pp.country_of_issue),
          fmtDate(pp.issue_date), fmtDate(pp.expiry_date),
          fmt(pp.place_of_birth), fmtDate(pp.date_of_birth),
          fmt(pp.photo_url),
        ];
      }),
    ];

    // TAB 3: PAYMENT
    const paymentRows = [
      ['Pax ID', 'Nama', 'Milestone', 'Amount (Rp)', 'Status', 'Paid At', 'Method', 'Notes'],
      ...payments.map((p) => {
        const pax = paxList.find((x) => x.id === p.passenger_id);
        const c = pax ? custMap[pax.customer_id] || {} : {};
        return [
          fmt(p.passenger_id), fmt(c.name),
          fmt(p.type), fmt(p.amount),
          p.is_transferred ? 'TRANSFERRED' : 'PAID',
          fmtDate(p.paid_at), fmt(p.method), fmt(p.notes),
        ];
      }),
    ];

    // TAB 4: HPP
    const hppRows = [
      ['ID', 'Kategori', 'Vendor', 'Komponen', 'Total (Rp)', 'DP Paid (Rp)', 'Sisa (Rp)', 'Status', 'Due Date', 'Invoice URL', 'Bukti Transfer URL', 'Created At'],
      ...(items || []).map((it) => {
        const total = Number(it.total_amount) || 0;
        const dp = Number(it.dp_paid) || 0;
        return [
          fmt(it.id), fmt(it.category), fmt(it.vendor || it.supplier),
          fmt(it.component || it.description),
          fmt(total), fmt(dp), fmt(total - dp),
          fmt(it.payment_status),
          fmtDate(it.due_date),
          fmt(it.invoice_url), fmt(it.transfer_proof_url),
          fmtDateTime(it.created_at),
        ];
      }),
    ];

    // TAB 5: SUMMARY
    const totalExpected = paxList.reduce((s, p) => s + (Number(p.price_paid) || 0), 0);
    const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const hppTotal = (items || []).reduce((s, x) => s + (Number(x.total_amount) || 0), 0);
    const summaryRows = [
      ['📋 TEONE Backup Sheet'],
      [''],
      ['Trip', `${trip.kode_trip || ''} — ${trip.name || ''}`],
      ['Departure', fmtDate(trip.departure)],
      ['Tour Leader', fmt(trip.tl_name)],
      [''],
      ['📊 STATS'],
      ['Total Peserta', paxList.length],
      ['Total Tagihan', fmt(totalExpected)],
      ['Total Dibayar', fmt(totalPaid)],
      ['Total Sisa', fmt(totalExpected - totalPaid)],
      ['Total HPP', fmt(hppTotal)],
      [''],
      ['⏱ LAST SYNC'],
      ['Synced At', new Date().toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })],
      ['Synced By', user.email || 'system'],
      [''],
      ['⚠ CATATAN'],
      ['Sheet ini AUTO-UPDATED dari TEONE.'],
      ['Edit di sheet akan di-overwrite saat sync berikutnya.'],
      ['Sheet ini fungsinya BACKUP — kalau TEONE crash, data terakhir ada di sini.'],
    ];

    // ============ WRITE TO SHEET ============
    await writeTab(trip.sheet_id, '📋 Peserta', pesertaRows);
    await writeTab(trip.sheet_id, '📕 Passport', passportRows);
    await writeTab(trip.sheet_id, '💰 Payment', paymentRows);
    await writeTab(trip.sheet_id, '💸 HPP', hppRows);
    await writeTab(trip.sheet_id, '📊 Summary', summaryRows);

    // Format header rows (run once cukup, tapi gak masalah kalau diulang)
    try {
      const sheetsClient = getSheetsClient();
      const meta = await sheetsClient.spreadsheets.get({ spreadsheetId: trip.sheet_id });
      const tabIds = meta.data.sheets.map((s) => s.properties.sheetId);
      for (const id of tabIds.slice(0, 4)) { // skip Summary (idx 4)
        await formatTab(trip.sheet_id, id);
      }
    } catch {} // formatting optional

    // Update last sync time
    await supabase
      .from('trips')
      .update({ last_sheet_sync_at: new Date().toISOString(), sheet_sync_error: null })
      .eq('id', tripId);

    revalidatePath(`/trips/${tripId}`);
    return { ok: true, synced_at: new Date().toISOString(), counts: { peserta: paxList.length, payment: payments.length, hpp: (items || []).length } };
  } catch (e) {
    const msg = msgFriendly(e?.message || String(e));
    // Save error to DB so user can see it
    await supabase.from('trips').update({ sheet_sync_error: msg }).eq('id', tripId);
    return { error: msg };
  }
}

// ============ UNLINK SHEET (kalau mau bikin baru) ============
export async function unlinkSheet(tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceSupabase() || authClient;
  await supabase
    .from('trips')
    .update({ sheet_id: null, sheet_url: null, last_sheet_sync_at: null, sheet_sync_error: null })
    .eq('id', tripId);

  revalidatePath(`/trips/${tripId}`);
  return { ok: true };
}

// ============ STATUS (buat UI check) ============
export async function getSheetStatus(tripId) {
  const supabase = getServiceSupabase() || createClient();
  const { data: trip } = await supabase
    .from('trips')
    .select('sheet_id, sheet_url, last_sheet_sync_at, sheet_sync_error')
    .eq('id', tripId)
    .maybeSingle();
  return {
    has_sheet: !!trip?.sheet_id,
    sheet_id: trip?.sheet_id || null,
    sheet_url: trip?.sheet_url || null,
    last_sync_at: trip?.last_sheet_sync_at || null,
    last_error: trip?.sheet_sync_error || null,
    sa_email: getServiceAccountEmail(),
  };
}
