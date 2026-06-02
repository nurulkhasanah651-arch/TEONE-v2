'use server';

// Round 189b: sheet-sync.js — improved error messages + diagnostic action
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
  getProjectId,
  diagnoseConnection,
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

function msgFriendly(msg) {
  if (!msg) return 'Unknown error';
  if (/GOOGLE_SHEETS_SA_KEY/.test(msg)) return '⚠ Env GOOGLE_SHEETS_SA_KEY belum di-set di Vercel.';
  if (/invalid_grant|invalid_client|invalid_jwt/i.test(msg)) return '⚠ Service Account JSON invalid / private_key corrupt. Re-paste JSON ke Vercel env.';
  if (/billing|billing.*disabled/i.test(msg)) return '⚠ BILLING belum di-enable di Google Cloud project. Buka console.cloud.google.com/billing, set up Free Trial $300.';
  if (/api has not been used|has not been enabled|disabled/i.test(msg)) return '⚠ Sheets API atau Drive API belum di-enable di project ini.';
  if (/caller does not have permission|permission.*denied|forbidden/i.test(msg)) {
    return '⚠ Permission denied. Cek: (1) Billing enabled? (2) Sheets+Drive API enabled di project YG SAMA dgn Service Account? (3) Coba klik "🔍 Test Connection" buat detail.';
  }
  if (/quota|rate.*exceeded/i.test(msg)) return '⚠ Quota Google API habis. Tunggu 1 menit, coba lagi.';
  return 'Error: ' + msg.slice(0, 200);
}

// ============ DIAGNOSTIC: test koneksi service account ============
export async function testSheetConnection() {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  try {
    const diag = await diagnoseConnection();
    return { ok: true, ...diag };
  } catch (e) {
    return {
      ok: false,
      error: msgFriendly(e?.message || String(e)),
      raw_error: (e?.message || String(e)).slice(0, 500),
    };
  }
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
    await makeSheetShareable(sheet_id, 'reader');

    await supabase
      .from('trips')
      .update({ sheet_id, sheet_url: url, last_sheet_sync_at: null, sheet_sync_error: null })
      .eq('id', tripId);

    const syncResult = await syncTripToSheet(tripId);
    if (syncResult.error) {
      return { ok: true, sheet_id, url, warning: 'Sheet dibuat tapi sync awal gagal: ' + syncResult.error };
    }

    revalidatePath(`/trips/${tripId}`);
    return { ok: true, sheet_id, url };
  } catch (e) {
    return { error: msgFriendly(e?.message || String(e)) };
  }
}

// ============ SYNC TRIP DATA TO SHEET (1-WAY) ============
export async function syncTripToSheet(tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceSupabase() || authClient;

  try {
    const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
    if (!trip) return { error: 'Trip gak ditemukan' };
    if (!trip.sheet_id) return { error: 'Trip belum punya Sheet. Klik "Buat Backup Sheet" dulu.' };

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

    await writeTab(trip.sheet_id, '📋 Peserta', pesertaRows);
    await writeTab(trip.sheet_id, '📕 Passport', passportRows);
    await writeTab(trip.sheet_id, '💰 Payment', paymentRows);
    await writeTab(trip.sheet_id, '💸 HPP', hppRows);
    await writeTab(trip.sheet_id, '📊 Summary', summaryRows);

    try {
      const sheetsClient = getSheetsClient();
      const meta = await sheetsClient.spreadsheets.get({ spreadsheetId: trip.sheet_id });
      const tabIds = meta.data.sheets.map((s) => s.properties.sheetId);
      for (const id of tabIds.slice(0, 4)) {
        await formatTab(trip.sheet_id, id);
      }
    } catch {}

    await supabase
      .from('trips')
      .update({ last_sheet_sync_at: new Date().toISOString(), sheet_sync_error: null })
      .eq('id', tripId);

    revalidatePath(`/trips/${tripId}`);
    return { ok: true, synced_at: new Date().toISOString(), counts: { peserta: paxList.length, payment: payments.length, hpp: (items || []).length } };
  } catch (e) {
    const msg = msgFriendly(e?.message || String(e));
    await supabase.from('trips').update({ sheet_sync_error: msg }).eq('id', tripId);
    return { error: msg };
  }
}

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
    project_id: getProjectId(),
  };
}
