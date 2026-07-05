'use server';

// R216a: Template Google Sheet UBAH ke struktur xlsx Master Trip Travelops
// Tabs: Master Info | Client Data | Manifest | Payment Checklist
// SEMUA logic existing TETAP UTUH (auth, create, share, link, sync, unlink)
// Cuma ubah: tab names + data rows structure
// Path: lib/actions/sheet-sync.js

import { revalidatePath } from 'next/cache';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { generateRoomlist, normalizeGender } from '@/lib/utils/roomlist';
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
  getDriveFolderId,
  diagnoseConnection,
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

// R216a: Helper buat hitung umur dari birthdate
function calcAge(birthdate) {
  if (!birthdate) return '';
  try {
    const b = new Date(birthdate);
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
    return age >= 0 ? age : '';
  } catch { return ''; }
}

// R216a: Validity Paspor — match formula: <8 bulan dari departure = Expired
function passportValidity(expiryDate, departureDate) {
  if (!expiryDate || !departureDate) return '-';
  try {
    const exp = new Date(expiryDate);
    const dep = new Date(departureDate);
    if (exp < dep) return 'Expired';
    const monthsDiff = (exp.getFullYear() - dep.getFullYear()) * 12 + (exp.getMonth() - dep.getMonth());
    if (monthsDiff < 8) return 'Expired';
    return 'OK';
  } catch { return '-'; }
}

// R216a: Format Title dari sex/gender
function titleFromGender(g) {
  if (!g) return '';
  const s = String(g).toUpperCase();
  if (s === 'L' || s === 'M' || s === 'MALE') return 'Mr';
  if (s === 'P' || s === 'F' || s === 'FEMALE') return 'Mrs';
  return s;
}

// R216a: Sex normalized
function sexNorm(g) {
  if (!g) return '';
  const s = String(g).toUpperCase();
  if (s === 'L' || s === 'M' || s === 'MALE') return 'MALE';
  if (s === 'P' || s === 'F' || s === 'FEMALE') return 'FEMALE';
  return s;
}

function msgFriendly(msg) {
  if (!msg) return 'Unknown error';
  if (/TEONE_DRIVE_FOLDER_ID/.test(msg)) return '⚠ Setup folder Drive dulu. Lihat petunjuk di panel.';
  if (/GOOGLE_SHEETS_SA_KEY/.test(msg)) return '⚠ Env GOOGLE_SHEETS_SA_KEY belum di-set di Vercel.';
  if (/invalid_grant|invalid_client/i.test(msg)) return '⚠ Service Account JSON invalid.';
  if (/api has not been used|has not been enabled/i.test(msg)) return '⚠ Sheets/Drive API belum enabled.';
  if (/caller does not have permission|permission.*denied|forbidden/i.test(msg)) {
    return '⚠ Permission denied. Share folder Drive ke service account dulu sebagai Editor.';
  }
  if (/quota|rate.*exceeded/i.test(msg)) return '⚠ Quota habis. Tunggu 1 menit.';
  if (/not.*found|404/i.test(msg)) return '⚠ Folder/Sheet tidak ditemukan.';
  return 'Error: ' + msg.slice(0, 200);
}

function extractSheetId(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

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

// ============ R191: AUTO-CREATE SHEET (cuma butuh setup folder sekali) ============
export async function createBackupSheet(tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceSupabase() || authClient;

  const folderId = getDriveFolderId();
  if (!folderId) {
    return {
      error: '⚠ Folder Drive belum di-setup. Setup folder dulu di section "Setup Folder Drive (1x)" di panel.',
    };
  }

  try {
    const { data: trip } = await supabase.from('trips').select('id, kode_trip, name, sheet_id').eq('id', tripId).maybeSingle();
    if (!trip) return { error: 'Trip gak ditemukan' };
    if (trip.sheet_id) return { error: 'Trip udah punya Sheet. Pakai "Sync Now" atau Unlink dulu.' };

    const sheetTitle = `${trip.kode_trip || trip.id} — ${trip.name || 'Trip'} — Master Trip Travelops`;

    // R191: Pakai parent folder, sheet inherit folder permission
    const { sheet_id, url } = await createSheet(sheetTitle, folderId);

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

// ============ Link existing sheet (fallback kalau gak mau setup folder) ============
export async function linkExistingSheet(tripId, urlOrId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceSupabase() || authClient;
  const sheetId = extractSheetId(urlOrId);
  if (!sheetId) return { error: '⚠ URL/ID Sheet tidak valid.' };

  try {
    const sheets = getSheetsClient();
    let meta;
    try {
      const r = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
      meta = r.data;
    } catch (e) {
      const msg = e?.message || String(e);
      if (/not.*found|404/i.test(msg)) return { error: '⚠ Sheet ID tidak ditemukan.' };
      if (/permission|403/i.test(msg)) {
        const saEmail = getServiceAccountEmail();
        return { error: `⚠ Service account belum di-share ke sheet ini.\n\nBuka sheet → Share → tambah email: ${saEmail} sebagai Editor.` };
      }
      return { error: msgFriendly(msg) };
    }

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
    const existingTabs = (meta.sheets || []).map((s) => s.properties.title);
    // R216a: tabs baru sesuai template xlsx
    const requiredTabs = ['Master Info', 'Client Data', 'Manifest', 'Payment Checklist', 'Refund', 'Final Roomlist'];
    const missingTabs = requiredTabs.filter((t) => !existingTabs.includes(t));

    if (missingTabs.length > 0) {
      const addRequests = missingTabs.map((t) => ({ addSheet: { properties: { title: t } } }));
      await sheets.spreadsheets.batchUpdate({ spreadsheetId: sheetId, requestBody: { requests: addRequests } });
    }

    await supabase
      .from('trips')
      .update({ sheet_id: sheetId, sheet_url: sheetUrl, last_sheet_sync_at: null, sheet_sync_error: null })
      .eq('id', tripId);

    const syncResult = await syncTripToSheet(tripId);
    if (syncResult.error) {
      return { ok: true, sheet_id: sheetId, url: sheetUrl, warning: 'Linked tapi sync awal gagal: ' + syncResult.error };
    }

    revalidatePath(`/trips/${tripId}`);
    return { ok: true, sheet_id: sheetId, url: sheetUrl };
  } catch (e) {
    return { error: msgFriendly(e?.message || String(e)) };
  }
}

// ============ SYNC (R216a: template baru — 4 tabs xlsx structure) ============
export async function syncTripToSheet(tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  return _syncTripToSheetCore(tripId, { authClient, user });
}

// R191: dipanggil oleh Supabase DB webhook (/api/webhook/sheet-sync) — TANPA sesi user.
// Pakai service-role client langsung; JANGAN gate via auth.getUser (itu bikin webhook
// selalu 'Not authenticated'). Export ini sebelumnya belum ada -> error runtime
// "(0 , r.syncTripToSheetFromWebhook) is not a function" (24x di produksi).
export async function syncTripToSheetFromWebhook(tripId) {
  const service = getServiceSupabase();
  if (!service) return { error: 'Service config missing' };
  return _syncTripToSheetCore(tripId, { authClient: service, user: null });
}

async function _syncTripToSheetCore(tripId, { authClient, user }) {
  const supabase = getServiceSupabase() || authClient;

  try {
    const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
    if (!trip) return { error: 'Trip gak ditemukan' };
    if (!trip.sheet_id) return { error: 'Trip belum punya Sheet.' };

    const { data: passengers } = await supabase
      .from('trip_passengers').select('*').eq('trip_id', tripId).order('joined_at', { ascending: true });

    const paxList = passengers || [];
    // Peserta aktif saja yang masuk master file (refund & pindah trip dikeluarkan)
    const isOut = (p) => p.transfer_status === 'transferred'
      || p.refund_status === 'refunded' || p.refund_status === 'partial_refund';
    const activePax = paxList.filter((p) => !isOut(p));
    const paxIds = paxList.map((p) => p.id);
    const custIds = paxList.map((p) => p.customer_id).filter(Boolean);

    let customers = [];
    if (custIds.length > 0) {
      const { data: c } = await supabase.from('customers').select('*').in('id', custIds);
      customers = c || [];
    }
    const custMap = Object.fromEntries(customers.map((c) => [c.id, c]));

    let payments = [];
    if (paxIds.length > 0) {
      const { data: pay } = await supabase
        .from('participant_payments').select('*').in('passenger_id', paxIds);
      payments = pay || [];
    }

    let refundRows = [];
    try {
      const { data: rf } = await supabase
        .from('refunds').select('*').eq('trip_id', tripId).order('created_at', { ascending: true });
      refundRows = rf || [];
    } catch {}

    let familyGroups = [];
    try {
      const { data: fg } = await supabase.from('family_groups').select('*').eq('trip_id', tripId);
      familyGroups = fg || [];
    } catch {}
    const fgMap = Object.fromEntries(familyGroups.map((g) => [g.id, g]));

    const departure = trip.departure;
    const kodeTrip = trip.kode_trip || '';

    // ====================================================================
    // TAB 1 — Master Info (header trip)
    // ====================================================================
    const masterInfoRows = [
      ['  '],
      ['TEMPLATE MASTER TRIP TRAVELOPS'],
      ['NAMA TRIP', fmt(trip.name)],
      ['TANGGAL TRIP', `${fmtDate(trip.departure)} - ${fmtDate(trip.return_date || trip.return || trip.end_date)}`],
      ['START', fmtDate(trip.departure)],
      ['END', fmtDate(trip.return_date || trip.return || trip.end_date)],
      ['KODE TRIP', kodeTrip],
      [''],
      ['Harga Full Trip', fmt(trip.price)],
      ['Harga Land Tour', fmt(trip.price_land_tour || '')],
      ['OPEN TRIP DATE', fmtDate(trip.open_trip_date || trip.created_at)],
      ['TARGET SEAT', fmt(trip.quota)],
      [''],
      ['Keterangan sheet di template ini'],
      ['Master Info', 'Header trip — nama, tanggal, kode, harga, target seat'],
      ['Client Data', 'Diisi oleh team CS — data peserta lengkap (29 kolom)'],
      ['Manifest', 'Buat send ke airline/hotel — subset paspor only'],
      ['Payment Checklist', 'Status pembayaran per peserta — breakdown per milestone'],
      ['Refund', 'Riwayat peserta refund & pindah trip (tidak masuk Client Data/Manifest)'],
      [''],
      ['📊 STATS'],
      ['Total Peserta Aktif', paxList.filter((p) => {
        const tr = p.transfer_status === 'transferred';
        const rf = p.refund_status === 'refunded' || p.refund_status === 'partial_refund';
        return !tr && !rf;
      }).length],
      ['Total Peserta Daftar', paxList.length],
      [''],
      ['⏱ LAST SYNC'],
      ['Synced At', new Date().toLocaleString('id-ID')],
      ['Synced By', user?.email || 'system'],
    ];

    // ====================================================================
    // TAB 2 — Client Data (29 kolom lengkap match xlsx)
    // ====================================================================
    const clientDataRows = [
      [
        'No.', 'Kode Booking', 'First Name', 'Surname', 'Dokumen', 'Title (Mr/Mrs)', 'Sex',
        'Phone (wa)', 'Room Type', 'Room Code', 'Asal Peserta', 'Noted', 'Fasilitas',
        'Status Peserta', 'Upgrade Room', 'Paid Asuransi', 'Paid Visa', 'Tgl Payment Visa',
        'Passport Number / KTP', 'Place Of Birth', 'Birthdate', 'Age',
        'Issue Date', 'ExpDate', 'Issuing Office', 'Validity Paspor',
        'DP', 'PAYMENT 1', 'PAYMENT 2',
      ],
      ...activePax.map((p, idx) => {
        const c = custMap[p.customer_id] || {};
        const fg = fgMap[p.family_group_id];
        const paxPayments = payments.filter((py) => py.passenger_id === p.id);
        const status = 'On Going';

        // Cari payment per type/milestone
        const findPayment = (type) => {
          const py = paxPayments.find((x) => x.type === type || (x.type || '').toLowerCase().includes(type.toLowerCase()));
          return py ? py.amount : '';
        };
        const dp = findPayment('DP') || findPayment('dp');
        const p1 = findPayment('P1') || findPayment('payment 1');
        const p2 = findPayment('P2') || findPayment('payment 2');

        // Cek asuransi/visa paid (check payment types)
        const paidVisa = paxPayments.some((x) => /visa/i.test(x.type || ''));
        const paidAsuransi = paxPayments.some((x) => /asurans|insurance/i.test(x.type || ''));
        const visaPayment = paxPayments.find((x) => /visa/i.test(x.type || ''));
        const tglVisa = visaPayment ? fmtDate(visaPayment.paid_at) : '';

        // Kode booking — format mirip xlsx: KODE_TRIP/00N
        const kodeBooking = kodeTrip ? `${kodeTrip}/${String(idx + 1).padStart(3, '0')}` : '';

        // Nama: first + last name
        const firstName = c.first_name || (c.name ? c.name.split(' ')[0] : '');
        const surname = c.surname || c.last_name || (c.name ? c.name.split(' ').slice(1).join(' ') : '');

        return [
          idx + 1,
          kodeBooking,
          fmt(firstName),
          fmt(surname),
          'Passport',
          titleFromGender(c.gender || c.sex),
          sexNorm(c.gender || c.sex),
          fmt(c.phone || c.whatsapp),
          fmt(p.room_type),
          fmt(p.room_code || ''),
          fmt(c.source || c.asal || fg?.name || ''),
          fmt(p.notes || c.notes || ''),
          fmt(p.fasilitas || 'Full Trip'),
          status,
          p.is_upgrade ? 'TRUE' : 'FALSE',
          paidAsuransi ? 'TRUE' : 'FALSE',
          paidVisa ? 'TRUE' : 'FALSE',
          tglVisa,
          fmt(c.passport_no || c.passport_number || c.ktp || ''),
          fmt(c.place_of_birth || c.city || ''),
          fmtDate(c.birthdate || c.date_of_birth || c.birthday),
          calcAge(c.birthdate || c.date_of_birth || c.birthday),
          fmtDate(c.passport_issued_date || c.issue_date),
          fmtDate(c.passport_expiry || c.expiry_date),
          fmt(c.passport_issued_at || c.issuing_office || ''),
          passportValidity(c.passport_expiry || c.expiry_date, departure),
          fmt(dp),
          fmt(p1),
          fmt(p2),
        ];
      }),
    ];

    // ====================================================================
    // TAB 3 — Manifest (11 kolom subset — buat airline/hotel)
    // ====================================================================
    const manifestRows = [
      [`MANIFEST ${trip.name || ''}`],
      [`${fmtDate(trip.departure)} - ${fmtDate(trip.return_date || trip.return || trip.end_date)}`],
      [''],
      [
        'No.', 'First Name/ Given Name', 'Surname', 'Title (Mr/Mrs)',
        'Passport Number / KTP', 'Place Of Birth', 'Birthdate', 'Age',
        'Issue Date', 'ExpDate', 'Issuing Office',
      ],
      ...activePax.map((p, idx) => {
        const c = custMap[p.customer_id] || {};
        const firstName = c.first_name || (c.name ? c.name.split(' ')[0] : '');
        const surname = c.surname || c.last_name || (c.name ? c.name.split(' ').slice(1).join(' ') : '');

        return [
          idx + 1,
          fmt(firstName),
          fmt(surname),
          titleFromGender(c.gender || c.sex),
          fmt(c.passport_no || c.passport_number || c.ktp || ''),
          fmt(c.place_of_birth || c.city || ''),
          fmtDate(c.birthdate || c.date_of_birth || c.birthday),
          calcAge(c.birthdate || c.date_of_birth || c.birthday),
          fmtDate(c.passport_issued_date || c.issue_date),
          fmtDate(c.passport_expiry || c.expiry_date),
          fmt(c.passport_issued_at || c.issuing_office || ''),
        ];
      }),
    ];

    // ====================================================================
    // TAB 4 — Payment Checklist (per peserta breakdown matrix)
    // ====================================================================
    // Dapetin semua unique milestone dari payments + template
    const paymentTemplate = (trip.payment_template && typeof trip.payment_template === 'object')
      ? trip.payment_template : {};
    const templateKeys = Object.keys(paymentTemplate);
    // Fallback default milestones kalau template kosong
    const milestoneKeys = templateKeys.length > 0
      ? templateKeys
      : ['DP', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'Pelunasan', 'Visa', 'Shopping'];

    const paymentChecklistRows = [
      [
        'No.', 'Nama Peserta', 'Phone', 'Room Type', 'Harga (Rp)',
        ...milestoneKeys,
        'Total Paid', 'Sisa', 'Status', 'Progress',
      ],
      ...activePax.map((p, idx) => {
        const c = custMap[p.customer_id] || {};
        const paxPayments = payments.filter((py) => py.passenger_id === p.id && !py.is_transferred);
        const nama = c.name || `${c.first_name || ''} ${c.surname || ''}`.trim();
        const harga = Number(p.price_paid) || 0;

        const perMilestone = milestoneKeys.map((m) => {
          const py = paxPayments.find((x) => {
            const t = (x.type || '').toLowerCase();
            return t === m.toLowerCase() || t.includes(m.toLowerCase());
          });
          return py ? Number(py.amount) || 0 : '';
        });

        const totalPaid = paxPayments.reduce((s, x) => s + (Number(x.amount) || 0), 0);
        const sisa = harga - totalPaid;
        const status = sisa <= 0 ? 'LUNAS' : totalPaid > 0 ? 'CICILAN' : 'BELUM BAYAR';
        const progress = harga > 0 ? `${Math.round((totalPaid / harga) * 100)}%` : '-';

        return [
          idx + 1,
          fmt(nama),
          fmt(c.phone),
          fmt(p.room_type),
          harga,
          ...perMilestone,
          totalPaid,
          sisa,
          status,
          progress,
        ];
      }),
      // Total row
      ['', 'TOTAL', '', '',
        activePax.reduce((s, p) => s + (Number(p.price_paid) || 0), 0),
        ...milestoneKeys.map((m) => {
          return payments
            .filter((x) => !x.is_transferred && ((x.type || '').toLowerCase() === m.toLowerCase() || (x.type || '').toLowerCase().includes(m.toLowerCase())))
            .reduce((s, x) => s + (Number(x.amount) || 0), 0);
        }),
        payments.filter((x) => !x.is_transferred).reduce((s, x) => s + (Number(x.amount) || 0), 0),
        '', '', '',
      ],
    ];

    // ====================================================================
    // TAB 5 — Refund (riwayat peserta refund / pindah trip)
    // ====================================================================
    const outPax = paxList.filter(isOut);
    const refundTabRows = [
      [`REFUND & TRANSFER HISTORY — ${trip.name || ''}`],
      [''],
      [
        'No.', 'Nama Peserta', 'Phone', 'Tipe', 'Alasan', 'Total Dibayar',
        'Jumlah Refund', 'Admin Fee', 'Metode', 'Bank', 'No. Rekening', 'a.n.',
        'Status', 'Tanggal', 'Pindah ke Trip',
      ],
      ...outPax.map((p, idx) => {
        const c = custMap[p.customer_id] || {};
        const isTrf = p.transfer_status === 'transferred';
        const rf = refundRows.find((r) => String(r.passenger_id) === String(p.id)) || {};
        return [
          idx + 1,
          fmt(c.name || `${c.first_name || ''} ${c.surname || ''}`.trim()),
          fmt(c.phone || c.whatsapp),
          isTrf ? 'PINDAH TRIP' : 'REFUND',
          fmt(rf.reason || p.refund_reason || p.transfer_reason || ''),
          Number(rf.total_paid ?? p.price_paid) || 0,
          isTrf ? '' : (Number(rf.refund_amount ?? p.refund_amount) || 0),
          isTrf ? '' : (Number(rf.admin_fee) || 0),
          fmt(rf.refund_method || ''),
          fmt(rf.refund_bank_name || ''),
          fmt(rf.refund_account_no || ''),
          fmt(rf.refund_account_name || ''),
          fmt(rf.status || (isTrf ? 'transferred' : p.refund_status || '')),
          fmtDate(rf.approved_at || rf.created_at || p.refunded_at || p.transferred_at),
          isTrf ? fmt(p.transferred_to_trip_id || '') : '',
        ];
      }),
    ];

    // ====================================================================
    // WRITE all 5 tabs
    // ====================================================================
    await writeTab(trip.sheet_id, 'Master Info', masterInfoRows);
    await writeTab(trip.sheet_id, 'Client Data', clientDataRows);
    await writeTab(trip.sheet_id, 'Manifest', manifestRows);
    await writeTab(trip.sheet_id, 'Payment Checklist', paymentChecklistRows);
    await writeTab(trip.sheet_id, 'Refund', refundTabRows);

    // ====================================================================
    // TAB 6 — Final Roomlist (auto-sync dari room type master file + family + gender)
    // ====================================================================
    // Pakai Final Roomlist tersimpan kalau ada; kalau belum, auto-generate
    const savedFinal = trip.final_roomlist?.rooms;
    const roomlist = Array.isArray(savedFinal) && savedFinal.length > 0
      ? savedFinal.map((r, i) => ({
          room_no: r.room_no || i + 1,
          room_type: r.room_type,
          capacity: r.capacity,
          label: r.label,
          is_family: r.is_family,
          gender: r.gender,
          needs_upgrade: !!r.note,
          upgrade_note: r.note || '',
          pax: [],
          _members: r.members || [],
        }))
      : generateRoomlist(activePax, customers);
    const isFinalSaved = Array.isArray(savedFinal) && savedFinal.length > 0;
    const roomlistTabRows = [
      [`FINAL ROOMLIST — ${trip.name || ''}${isFinalSaved ? ' ✓ (disimpan manual)' : ' (auto)'}`],
      [`${fmtDate(trip.departure)} - ${fmtDate(trip.return_date || trip.return || trip.end_date)}`],
      [''],
      ['Room#', 'Type', 'Cap', 'Label', 'Gender', 'Pax 1', 'Pax 2', 'Pax 3', 'Pax 4', 'Note'],
      ...roomlist.map((r) => {
        const names = [0, 1, 2, 3].map((i) => {
          if (r._members) {
            const m = r._members[i];
            return m ? `${m.name}${m.gender && m.gender !== '?' ? ` (${m.gender})` : ''}` : '';
          }
          const p = r.pax[i];
          if (!p) return '';
          const c = custMap[p.customer_id] || {};
          const g = normalizeGender({ ...p, gender: c.gender || c.sex });
          return `${c.name || `#${p.id}`}${g !== '?' ? ` (${g})` : ''}`;
        });
        return [
          r.room_no,
          (r.room_type || '').toUpperCase(),
          r.capacity,
          fmt(r.label),
          r.is_family ? 'FAMILY' : r.gender === 'M' ? 'COWOK' : r.gender === 'F' ? 'CEWOK' : '?',
          ...names,
          r.needs_upgrade ? `🔔 ${r.upgrade_note || 'NEED UPGRADE ROOM'}` : '',
        ];
      }),
    ];
    await writeTab(trip.sheet_id, 'Final Roomlist', roomlistTabRows);

    // Format header row di tabs
    try {
      const sheetsClient = getSheetsClient();
      const meta = await sheetsClient.spreadsheets.get({ spreadsheetId: trip.sheet_id });
      const tabIds = meta.data.sheets.slice(0, 6).map((s) => s.properties.sheetId);
      for (const id of tabIds) {
        try { await formatTab(trip.sheet_id, id); } catch {}
      }
    } catch {}

    await supabase
      .from('trips')
      .update({ last_sheet_sync_at: new Date().toISOString(), sheet_sync_error: null })
      .eq('id', tripId);

    revalidatePath(`/trips/${tripId}`);
    return {
      ok: true,
      counts: {
        peserta: paxList.length,
        peserta_aktif: paxList.filter((p) => p.transfer_status !== 'transferred' && p.refund_status !== 'refunded').length,
        payment: payments.length,
        milestones: milestoneKeys.length,
      },
    };
  } catch (e) {
    const msg = msgFriendly(e?.message || String(e));
    const supabaseErr = getServiceSupabase() || authClient;
    await supabaseErr.from('trips').update({ sheet_sync_error: msg }).eq('id', tripId);
    return { error: msg };
  }
}

export async function unlinkSheet(tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceSupabase() || authClient;
  await supabase.from('trips').update({ sheet_id: null, sheet_url: null, last_sheet_sync_at: null, sheet_sync_error: null }).eq('id', tripId);
  revalidatePath(`/trips/${tripId}`);
  return { ok: true };
}

export async function getSheetStatus(tripId) {
  const supabase = getServiceSupabase() || createClient();
  const { data: trip } = await supabase.from('trips')
    .select('sheet_id, sheet_url, last_sheet_sync_at, sheet_sync_error')
    .eq('id', tripId).maybeSingle();
  return {
    has_sheet: !!trip?.sheet_id,
    sheet_id: trip?.sheet_id || null,
    sheet_url: trip?.sheet_url || null,
    last_sync_at: trip?.last_sheet_sync_at || null,
    last_error: trip?.sheet_sync_error || null,
    sa_email: getServiceAccountEmail(),
    project_id: getProjectId(),
    folder_id: getDriveFolderId(),
    folder_configured: !!getDriveFolderId(),
  };
}
