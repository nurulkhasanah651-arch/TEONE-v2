'use server';

// R196: Accounting Sheet sync — cash in/out monthly + monthly report
// Path: lib/actions/accounting-sheet.js

import { revalidatePath } from 'next/cache';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  writeTab,
  formatTab,
  getSheetsClient,
  getServiceAccountEmail,
} from '@/lib/utils/google-sheets';

function getServiceSupabase() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function fmt(v) { return v == null ? '' : String(v); }
function rp(n) { return Number(n || 0); }
function getMonthKey(d) {
  if (!d) return '';
  try {
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  } catch { return ''; }
}
function monthLabel(key) {
  if (!key) return '';
  const [y, m] = key.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

function extractSheetId(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

function msgFriendly(msg) {
  if (!msg) return 'Unknown error';
  if (/GOOGLE_SHEETS_SA_KEY/.test(msg)) return '⚠ Env GOOGLE_SHEETS_SA_KEY belum di-set';
  if (/permission|forbidden|403/i.test(msg)) {
    const email = getServiceAccountEmail();
    return `⚠ Service account belum punya akses.\n\nShare Sheet ke email: ${email} sebagai Editor.`;
  }
  if (/not.*found|404/i.test(msg)) return '⚠ Sheet tidak ditemukan';
  return 'Error: ' + msg.slice(0, 200);
}

// ============================================================
// GET status sheet
// ============================================================
export async function getAccountingSheetStatus() {
  const supabase = getServiceSupabase() || createClient();
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'accounting_sheet')
    .maybeSingle();

  const v = data?.value || {};
  return {
    has_sheet: !!v.sheet_id,
    sheet_id: v.sheet_id || null,
    sheet_url: v.sheet_url || null,
    last_sync_at: v.last_sync_at || null,
    last_error: v.last_error || null,
    sa_email: getServiceAccountEmail(),
  };
}

// ============================================================
// LINK existing sheet
// ============================================================
export async function linkAccountingSheet(urlOrId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceSupabase() || authClient;
  const sheetId = extractSheetId(urlOrId);
  if (!sheetId) return { error: '⚠ URL/ID Sheet tidak valid' };

  try {
    // Verify access + add tabs
    const sheets = getSheetsClient();
    let meta;
    try {
      const r = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
      meta = r.data;
    } catch (e) {
      return { error: msgFriendly(e?.message || String(e)) };
    }

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
    const existingTabs = (meta.sheets || []).map((s) => s.properties.title);
    const requiredTabs = ['💰 Cash In Monthly', '💸 Cash Out Monthly', '📊 Monthly Report'];
    const missingTabs = requiredTabs.filter((t) => !existingTabs.includes(t));

    if (missingTabs.length > 0) {
      const addRequests = missingTabs.map((t) => ({ addSheet: { properties: { title: t } } }));
      await sheets.spreadsheets.batchUpdate({ spreadsheetId: sheetId, requestBody: { requests: addRequests } });
    }

    // Save to app_settings
    await supabase
      .from('app_settings')
      .upsert({
        key: 'accounting_sheet',
        value: {
          sheet_id: sheetId,
          sheet_url: sheetUrl,
          last_sync_at: null,
          last_error: null,
        },
        updated_at: new Date().toISOString(),
        updated_by: user.email || 'unknown',
      });

    // Initial sync
    const r = await syncAccountingToSheet();
    if (r.error) return { ok: true, sheet_id: sheetId, url: sheetUrl, warning: 'Linked tapi sync awal gagal: ' + r.error };

    revalidatePath('/accounting');
    return { ok: true, sheet_id: sheetId, url: sheetUrl };
  } catch (e) {
    return { error: msgFriendly(e?.message || String(e)) };
  }
}

// ============================================================
// CORE sync function (no auth check — bisa dari webhook nanti)
// ============================================================
async function _doSyncAccountingToSheet(syncedBy = 'system') {
  const supabase = getServiceSupabase();
  if (!supabase) return { error: 'Service config missing' };

  const { data: setting } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'accounting_sheet')
    .maybeSingle();
  const sheetId = setting?.value?.sheet_id;
  if (!sheetId) return { error: 'Sheet belum di-link' };

  try {
    // Fetch all data
    const [
      paymentsRes, accEntriesRes, hppLunasRes,
      passengersRes, customersRes, tripsRes, finItemsRes,
    ] = await Promise.all([
      supabase.from('participant_payments').select('*').order('paid_at', { ascending: false, nullsFirst: false }),
      supabase.from('accounting_entries').select('*').order('date', { ascending: false }),
      supabase.from('trip_finance_items').select('*').eq('item_type', 'hpp').eq('payment_status', 'lunas'),
      supabase.from('trip_passengers').select('id, trip_id, customer_id'),
      supabase.from('customers').select('id, name'),
      supabase.from('trips').select('id, kode_trip, name'),
      supabase.from('trip_finance_items').select('*'),
    ]);

    const payments = paymentsRes.data || [];
    const accEntries = accEntriesRes.data || [];
    const hppLunas = hppLunasRes.data || [];
    const passengers = passengersRes.data || [];
    const customers = customersRes.data || [];
    const trips = tripsRes.data || [];

    const paxMap = Object.fromEntries(passengers.map((p) => [p.id, p]));
    const custMap = Object.fromEntries(customers.map((c) => [c.id, c]));
    const tripMap = Object.fromEntries(trips.map((t) => [t.id, t]));

    // ============ CASH IN MONTHLY ============
    // Sumber: participant_payments + accounting_entries (type='in')
    const cashInByMonth = {};
    for (const p of payments) {
      if (!p.amount || p.amount <= 0) continue;
      const key = getMonthKey(p.paid_at);
      if (!key) continue;
      const pax = paxMap[p.passenger_id];
      const cust = pax ? custMap[pax.customer_id] : null;
      const trip = pax ? tripMap[pax.trip_id] : null;
      if (!cashInByMonth[key]) cashInByMonth[key] = [];
      cashInByMonth[key].push({
        date: p.paid_at, type: 'Payment Peserta',
        milestone: p.type || '-',
        amount: rp(p.amount),
        peserta: cust?.name || '-',
        trip: trip?.kode_trip || trip?.id || '-',
        note: p.notes || '',
      });
    }
    for (const e of accEntries) {
      if (e.type !== 'in') continue;
      const key = getMonthKey(e.date);
      if (!key) continue;
      if (!cashInByMonth[key]) cashInByMonth[key] = [];
      cashInByMonth[key].push({
        date: e.date, type: e.category || 'Income',
        milestone: '-',
        amount: rp(e.amount),
        peserta: e.description || '-',
        trip: e.trip_id || '-',
        note: e.notes || '',
      });
    }

    const cashInRows = [
      ['Bulan', 'Tanggal', 'Type', 'Milestone', 'Amount (Rp)', 'Peserta', 'Trip', 'Note'],
    ];
    const cashInMonths = Object.keys(cashInByMonth).sort().reverse();
    for (const m of cashInMonths) {
      const items = cashInByMonth[m].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      let monthTotal = 0;
      for (const r of items) {
        cashInRows.push([monthLabel(m), r.date || '', r.type, r.milestone, r.amount, r.peserta, r.trip, r.note]);
        monthTotal += r.amount;
      }
      cashInRows.push(['', '', '', `TOTAL ${monthLabel(m)}`, monthTotal, '', '', '']);
      cashInRows.push(['', '', '', '', '', '', '', '']);
    }

    // ============ CASH OUT MONTHLY ============
    // Sumber: HPP lunas + accounting_entries (type='out')
    const cashOutByMonth = {};
    for (const h of hppLunas) {
      const dt = h.transfer_date || h.paid_at || h.updated_at || h.created_at;
      const key = getMonthKey(dt);
      if (!key) continue;
      const trip = tripMap[h.trip_id];
      if (!cashOutByMonth[key]) cashOutByMonth[key] = [];
      cashOutByMonth[key].push({
        date: dt, type: h.category || 'HPP',
        component: h.component || '-',
        amount: rp(h.total_amount),
        vendor: h.vendor_name || '-',
        trip: trip?.kode_trip || trip?.id || '-',
        note: h.notes || '',
      });
    }
    for (const e of accEntries) {
      if (e.type !== 'out') continue;
      const key = getMonthKey(e.date);
      if (!key) continue;
      if (!cashOutByMonth[key]) cashOutByMonth[key] = [];
      cashOutByMonth[key].push({
        date: e.date, type: e.category || 'Expense',
        component: '-',
        amount: rp(e.amount),
        vendor: e.description || '-',
        trip: e.trip_id || '-',
        note: e.notes || '',
      });
    }

    const cashOutRows = [
      ['Bulan', 'Tanggal', 'Type', 'Komponen', 'Amount (Rp)', 'Vendor', 'Trip', 'Note'],
    ];
    const cashOutMonths = Object.keys(cashOutByMonth).sort().reverse();
    for (const m of cashOutMonths) {
      const items = cashOutByMonth[m].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      let monthTotal = 0;
      for (const r of items) {
        cashOutRows.push([monthLabel(m), r.date || '', r.type, r.component, r.amount, r.vendor, r.trip, r.note]);
        monthTotal += r.amount;
      }
      cashOutRows.push(['', '', '', `TOTAL ${monthLabel(m)}`, monthTotal, '', '', '']);
      cashOutRows.push(['', '', '', '', '', '', '', '']);
    }

    // ============ MONTHLY REPORT (combined) ============
    const allMonths = new Set([...cashInMonths, ...cashOutMonths]);
    const monthlyReportRows = [
      ['Bulan', 'Cash In (Rp)', 'Cash Out (Rp)', 'Net Cash Flow (Rp)', 'Notes'],
    ];
    let grandIn = 0, grandOut = 0;
    const sortedMonths = Array.from(allMonths).sort().reverse();
    for (const m of sortedMonths) {
      const inTotal = (cashInByMonth[m] || []).reduce((s, r) => s + r.amount, 0);
      const outTotal = (cashOutByMonth[m] || []).reduce((s, r) => s + r.amount, 0);
      const net = inTotal - outTotal;
      grandIn += inTotal;
      grandOut += outTotal;
      monthlyReportRows.push([monthLabel(m), inTotal, outTotal, net, net >= 0 ? 'Surplus' : 'Defisit']);
    }
    monthlyReportRows.push(['', '', '', '', '']);
    monthlyReportRows.push(['GRAND TOTAL', grandIn, grandOut, grandIn - grandOut, grandIn - grandOut >= 0 ? 'Surplus' : 'Defisit']);
    monthlyReportRows.push(['', '', '', '', '']);
    monthlyReportRows.push(['⏱ Last Sync', new Date().toLocaleString('id-ID'), '', '', '']);
    monthlyReportRows.push(['Synced By', syncedBy, '', '', '']);

    // ============ WRITE TO SHEET ============
    await writeTab(sheetId, '💰 Cash In Monthly', cashInRows);
    await writeTab(sheetId, '💸 Cash Out Monthly', cashOutRows);
    await writeTab(sheetId, '📊 Monthly Report', monthlyReportRows);

    // Format header rows
    try {
      const meta = await getSheetsClient().spreadsheets.get({ spreadsheetId: sheetId });
      const tabIds = (meta.data.sheets || [])
        .filter((s) => ['💰 Cash In Monthly', '💸 Cash Out Monthly', '📊 Monthly Report'].includes(s.properties.title))
        .map((s) => s.properties.sheetId);
      for (const id of tabIds) {
        try { await formatTab(sheetId, id); } catch {}
      }
    } catch {}

    // Update last sync
    const settingData = setting?.value || {};
    await supabase
      .from('app_settings')
      .upsert({
        key: 'accounting_sheet',
        value: {
          ...settingData,
          sheet_id: sheetId,
          last_sync_at: new Date().toISOString(),
          last_error: null,
        },
        updated_at: new Date().toISOString(),
      });

    revalidatePath('/accounting');
    return {
      ok: true,
      counts: {
        cash_in_rows: cashInRows.length - 1,
        cash_out_rows: cashOutRows.length - 1,
        months: sortedMonths.length,
      },
    };
  } catch (e) {
    const msg = msgFriendly(e?.message || String(e));
    try {
      const v = setting?.value || {};
      await supabase.from('app_settings').upsert({
        key: 'accounting_sheet',
        value: { ...v, last_error: msg },
        updated_at: new Date().toISOString(),
      });
    } catch {}
    return { error: msg };
  }
}

// Public: sync with auth check
export async function syncAccountingToSheet() {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  return _doSyncAccountingToSheet(user.email || 'user');
}

// Webhook version (skip auth)
export async function syncAccountingToSheetFromWebhook() {
  return _doSyncAccountingToSheet('webhook-autosync');
}

// Unlink
export async function unlinkAccountingSheet() {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceSupabase() || authClient;
  await supabase
    .from('app_settings')
    .upsert({
      key: 'accounting_sheet',
      value: { sheet_id: null, sheet_url: null, last_sync_at: null, last_error: null },
      updated_at: new Date().toISOString(),
    });

  revalidatePath('/accounting');
  return { ok: true };
}
