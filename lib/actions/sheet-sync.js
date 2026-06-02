'use server';

// Round 189c: sheet-sync.js + LINK EXISTING SHEET mode
// User bikin sheet sendiri di Drive-nya, share ke service account, paste URL ke TEONE
// Bypass masalah "permission denied" pas TEONE coba bikin sheet di Drive service account
//
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
  if (/invalid_grant|invalid_client|invalid_jwt/i.test(msg)) return '⚠ Service Account JSON invalid. Re-paste JSON ke Vercel env.';
  if (/billing|billing.*disabled/i.test(msg)) return '⚠ Billing belum enabled.';
  if (/api has not been used|has not been enabled|disabled/i.test(msg)) return '⚠ Sheets/Drive API belum enabled.';
  if (/caller does not have permission|permission.*denied|forbidden/i.test(msg)) {
    return '⚠ Permission denied di Drive create — pakai mode LINK EXISTING SHEET aja (paste URL sheet yg udah ada).';
  }
  if (/quota|rate.*exceeded/i.test(msg)) return '⚠ Quota habis. Tunggu 1 menit.';
  if (/not.*found|404/i.test(msg)) return '⚠ Sheet ID tidak ditemukan. Pastikan URL benar dan sudah di-share ke service account.';
  return 'Error: ' + msg.slice(0, 200);
}

// R189c: Extract spreadsheet ID dari URL Google Sheets
function extractSheetId(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  // Match format: https://docs.google.com/spreadsheets/d/SHEET_ID/edit...
  const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  // Mungkin udah ID-nya doang
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

// ============ DIAGNOSTIC ============
export async function testSheetConnection() {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  try {
    const diag = await diagnoseConnection();
    return { ok: true, ...diag };
  } catch (e) {
    return { ok: false, error: msgFriendly(e?.message || String(e)) };
  }
}

// ============ R189c: LINK EXISTING SHEET — paste URL yg udah dibikin user ============
export async function linkExistingSheet(tripId, urlOrId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceSupabase() || authClient;

  const sheetId = extractSheetId(urlOrId);
  if (!sheetId) return { error: '⚠ URL/ID Sheet tidak valid. Pastikan kamu paste URL lengkap dari Google Sheets.' };

  try {
    // Test akses ke sheet — kalau gak bisa read, brarti belum di-share atau salah ID
    const sheets = getSheetsClient();
    let meta;
    try {
      const r = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
      meta = r.data;
    } catch (e) {
      const msg = e?.message || String(e);
      if (/not.*found|404/i.test(msg)) {
        return { error: '⚠ Sheet ID tidak ditemukan. Cek URL bener atau tidak.' };
      }
      if (/permission|forbidden|403/i.test(msg)) {
        const saEmail = getServiceAccountEmail();
        return {
          error: `⚠ Service account belum punya akses ke sheet ini.\n\nLangkah:\n1. Buka sheet di browser\n2. Klik "Share" (kanan atas)\n3. Tambah email: ${saEmail}\n4. Set permission: Editor\n5. Klik Send → coba lagi`,
        };
      }
      return { error: msgFriendly(msg) };
    }

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
    const sheetTitle = meta?.properties?.title || 'Linked Sheet';

    // Pastikan tabs yang dibutuhin ada — kalau belum ada, bikin baru
    const existingTabs = (meta.sheets || []).map((s) => s.properties.title);
    const requiredTabs = ['📋 Peserta', '📕 Passport', '💰 Payment', '💸 HPP', '📊 Summary'];
    const missingTabs = requiredTabs.filter((t) => !existingTabs.includes(t));

    if (missingTabs.length > 0) {
      const addRequests = missingTabs.map((title) => ({
        addSheet: { properties: { title } },
      }));
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: { requests: addRequests },
        });
      } catch (e) {
        return { error: '⚠ Gagal tambah tab. Pastikan service account akses Editor, bukan Viewer. Error: ' + (e?.message || '') };
      }
    }

    // Save sheet ID ke DB
    await supabase
      .from('trips')
      .update({
        sheet_id: sheetId,
        sheet_url: sheetUrl,
        last_sheet_sync_at: null,
        sheet_sync_error: null,
      })
      .eq('id', tripId);

    // Initial sync
    const syncResult = await syncTripToSheet(tripId);
    if (syncResult.error) {
      return { ok: true, sheet_id: sheetId, url: sheetUrl, warning: 'Sheet linked tapi initial sync gagal: ' + syncResult.error };
    }

    revalidatePath(`/trips/${tripId}`);
    return { ok: true, sheet_id: sheetId, url: sheetUrl, title: sheetTitle };
  } catch (e) {
    return { error: msgFriendly(e?.message || String(e)) };
  }
}

// ============ CREATE NEW BACKUP SHEET (legacy, mungkin gagal kalau ada org policy) ============
export async function createBackupSheet(tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceSupabase() || authClient;

  try {
    const { data: trip } = await supabase.from('trips').select('id, kode_trip, name, sheet_id').eq('id', tripId).maybeSingle();
    if (!trip) return { error: 'Trip gak ditemukan' };
    if (trip.sheet_id) return { error: 'Trip udah punya Sheet. Pakai "Sync Now" atau "Unlink" dulu.' };

    const sheetTitle = `TEONE Backup — ${trip.kode_trip || trip.id} — ${trip.name || 'Trip'}`;
    const { sheet_id, url } = await createSheet(sheetTitle);
    try { await makeSheetShareable(sheet_id, 'reader'); } catch {} // share optional

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

// ============ SYNC TRIP DATA TO SHEET ============
export async function syncTripToSheet(tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceSupabase() || authClient;

  try {
    const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
    if (!trip) return { error: 'Trip gak ditemukan' };
    if (!trip.sheet_id) return { error: 'Trip belum punya Sheet. Link atau buat dulu.' };

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
      ['Synced At', new Date().toLocaleString('id-ID')],
      ['Synced By', user.email || 'system'],
      [''],
      ['⚠ CATATAN'],
      ['Sheet ini AUTO-UPDATED dari TEONE.'],
      ['Edit di sheet akan di-overwrite saat sync berikutnya.'],
    ];

    await writeTab(trip.sheet_id, '📋 Peserta', pesertaRows);
    await writeTab(trip.sheet_id, '📕 Passport', passportRows);
    await writeTab(trip.sheet_id, '💰 Payment', paymentRows);
    await writeTab(trip.sheet_id, '💸 HPP', hppRows);
    await writeTab(trip.sheet_id, '📊 Summary', summaryRows);

    try {
      const sheetsClient = getSheetsClient();
      const meta = await sheetsClient.spreadsheets.get({ spreadsheetId: trip.sheet_id });
      const tabIds = meta.data.sheets.slice(0, 4).map((s) => s.properties.sheetId);
      for (const id of tabIds) {
        try { await formatTab(trip.sheet_id, id); } catch {}
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
