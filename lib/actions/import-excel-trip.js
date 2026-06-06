'use server';

// R216b: Import peserta dari Excel ke Master Trip
// 2-step: preview → confirm
// Match strategy: passport_no → phone → nama (combo)
// Duplicate: SKIP (peserta yg udah di trip ini di-skip)
// Payment: insert ke participant_payments (auto-flow ke cashflow karena cashflow aggregate dari sini)
// Path: lib/actions/import-excel-trip.js

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Helper normalize
function normPhone(p) {
  if (!p) return '';
  return String(p).replace(/\D/g, '').replace(/^0/, '62');
}
function normName(n) {
  if (!n) return '';
  return String(n).toLowerCase().replace(/[^a-z0-9]/g, '');
}
function normPassport(p) {
  if (!p) return '';
  return String(p).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Detect gender from title/sex
function detectGender(title, sex) {
  const s = String(sex || '').toUpperCase();
  if (s === 'MALE' || s === 'M' || s === 'L') return 'L';
  if (s === 'FEMALE' || s === 'F' || s === 'P') return 'P';
  const t = String(title || '').toUpperCase();
  if (t.includes('MR')) return 'L';
  if (t.includes('MRS') || t.includes('MS') || t.includes('MISS')) return 'P';
  return '';
}

function parseExcelDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (d && d.y) {
      return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    }
  }
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

function parseAmount(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  // Remove "Rp", spaces, dots, etc.
  const cleaned = String(v).replace(/[^\d-]/g, '');
  return Number(cleaned) || 0;
}

// ============================================================
// STEP 1: PREVIEW — parse + match, return preview rows
// ============================================================
export async function previewExcelImport(tripId, formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  const file = formData.get('file');
  if (!file) return { error: 'File belum dipilih' };

  let workbook;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch (e) {
    return { error: 'Gagal baca file Excel: ' + (e?.message || 'unknown') };
  }

  // Cari sheet "Client Data" (case insensitive)
  const sheetName = workbook.SheetNames.find((n) => /client.?data/i.test(n));
  if (!sheetName) {
    return { error: `Sheet "Client Data" gak ketemu. Sheet yg ada: ${workbook.SheetNames.join(', ')}` };
  }
  const sheet = workbook.Sheets[sheetName];

  // Headers di row 11 (1-indexed), data dari row 12
  // Pakai range A11:AC** dan baca dgn header explicit
  const HEADER_KEYS = [
    'no', 'kode_booking', 'first_name', 'surname', 'dokumen', 'title', 'sex',
    'phone', 'room_type', 'room_code', 'asal', 'noted', 'fasilitas',
    'status', 'upgrade_room', 'paid_asuransi', 'paid_visa', 'tgl_visa',
    'passport_no', 'place_of_birth', 'birthdate', 'age',
    'issue_date', 'exp_date', 'issuing_office', 'validity',
    'dp', 'p1', 'p2',
  ];

  let rawRows;
  try {
    rawRows = XLSX.utils.sheet_to_json(sheet, {
      range: 11, // skip 11 baris (header di row 11, mulai data row 12)
      header: HEADER_KEYS,
      defval: null,
      raw: false, // strings instead of formulas
    });
  } catch (e) {
    return { error: 'Gagal parse Client Data sheet: ' + (e?.message || 'unknown') };
  }

  // Filter row yg ada First Name
  const validRows = rawRows.filter((r) => r.first_name && String(r.first_name).trim());

  if (validRows.length === 0) {
    return { error: 'Tidak ada peserta di Excel (semua baris First Name kosong)' };
  }

  // Get trip + existing peserta + existing customers
  const { data: trip } = await supabase.from('trips').select('id, kode_trip, name').eq('id', tripId).maybeSingle();
  if (!trip) return { error: 'Trip gak ditemukan' };

  const { data: existingPax } = await supabase
    .from('trip_passengers')
    .select('id, customer_id')
    .eq('trip_id', tripId);

  const existingPaxCustIds = new Set((existingPax || []).map((p) => p.customer_id).filter(Boolean));

  // Get all customers (untuk match passport/phone/nama)
  const { data: allCustomers } = await supabase
    .from('customers')
    .select('id, name, first_name, surname, phone, whatsapp, passport_no, passport_number');

  const custByPassport = {};
  const custByPhone = {};
  const custByName = {};
  for (const c of (allCustomers || [])) {
    const pp = normPassport(c.passport_no || c.passport_number);
    if (pp) custByPassport[pp] = c;
    const ph = normPhone(c.phone || c.whatsapp);
    if (ph) custByPhone[ph] = c;
    const nn = normName(c.name || `${c.first_name || ''} ${c.surname || ''}`);
    if (nn) custByName[nn] = c;
  }

  // Build preview rows
  const previewRows = validRows.map((r, idx) => {
    const firstName = String(r.first_name || '').trim();
    const surname = String(r.surname || '').trim();
    const fullName = `${firstName} ${surname}`.trim();

    const passportRaw = r.passport_no;
    const passportNorm = normPassport(passportRaw);
    const phoneNorm = normPhone(r.phone);
    const nameNorm = normName(fullName);

    // Match strategy: passport → phone → nama
    let matchedCustomer = null;
    let matchVia = '';
    if (passportNorm && custByPassport[passportNorm]) {
      matchedCustomer = custByPassport[passportNorm];
      matchVia = 'passport';
    } else if (phoneNorm && custByPhone[phoneNorm]) {
      matchedCustomer = custByPhone[phoneNorm];
      matchVia = 'phone';
    } else if (nameNorm && custByName[nameNorm]) {
      matchedCustomer = custByName[nameNorm];
      matchVia = 'name';
    }

    // Status:
    // - skip: customer matched AND udah di trip ini
    // - new_customer: customer baru (insert customer + insert pax)
    // - existing_customer: customer udah ada di DB tapi belum di trip ini (insert pax aja)
    let status = '';
    if (matchedCustomer && existingPaxCustIds.has(matchedCustomer.id)) {
      status = 'skip';
    } else if (matchedCustomer) {
      status = 'existing_customer';
    } else {
      status = 'new_customer';
    }

    const dp = parseAmount(r.dp);
    const p1 = parseAmount(r.p1);
    const p2 = parseAmount(r.p2);
    const totalPayment = dp + p1 + p2;

    return {
      excel_row: idx + 12, // baris di Excel (1-indexed)
      first_name: firstName,
      surname: surname,
      full_name: fullName,
      phone: r.phone || '',
      passport_no: passportRaw || '',
      place_of_birth: r.place_of_birth || '',
      birthdate: parseExcelDate(r.birthdate),
      issue_date: parseExcelDate(r.issue_date),
      exp_date: parseExcelDate(r.exp_date),
      issuing_office: r.issuing_office || '',
      title: r.title || '',
      sex: r.sex || '',
      gender: detectGender(r.title, r.sex),
      room_type: r.room_type || '',
      room_code: r.room_code || '',
      asal: r.asal || '',
      noted: r.noted || '',
      fasilitas: r.fasilitas || '',
      status_peserta: r.status || '',
      dp,
      p1,
      p2,
      total_payment: totalPayment,
      // Match info
      match_status: status,
      match_via: matchVia,
      matched_customer_id: matchedCustomer?.id || null,
      matched_customer_name: matchedCustomer?.name || null,
    };
  });

  const stats = {
    total: previewRows.length,
    new_customer: previewRows.filter((r) => r.match_status === 'new_customer').length,
    existing_customer: previewRows.filter((r) => r.match_status === 'existing_customer').length,
    skip: previewRows.filter((r) => r.match_status === 'skip').length,
    total_payment: previewRows.reduce((s, r) => s + r.total_payment, 0),
  };

  return { ok: true, trip: { id: trip.id, kode_trip: trip.kode_trip, name: trip.name }, rows: previewRows, stats };
}

// ============================================================
// STEP 2: CONFIRM — actual insert
// ============================================================
export async function confirmExcelImport(tripId, rows) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  if (!Array.isArray(rows) || rows.length === 0) {
    return { error: 'Gak ada data buat di-import' };
  }

  const { data: trip } = await supabase.from('trips').select('id, kode_trip, name').eq('id', tripId).maybeSingle();
  if (!trip) return { error: 'Trip gak ditemukan' };

  let insertedCustomers = 0;
  let insertedPax = 0;
  let insertedPayments = 0;
  let skipped = 0;
  const errors = [];

  for (const row of rows) {
    if (row.match_status === 'skip') {
      skipped++;
      continue;
    }

    try {
      let customerId = row.matched_customer_id;

      // Step 1: Insert customer kalau new
      if (!customerId) {
        const customerData = {
          name: row.full_name,
          first_name: row.first_name,
          surname: row.surname,
          phone: row.phone || null,
          whatsapp: row.phone || null,
          gender: row.gender || null,
          passport_no: row.passport_no || null,
          place_of_birth: row.place_of_birth || null,
          birthdate: row.birthdate || null,
          passport_issued_date: row.issue_date || null,
          passport_expiry: row.exp_date || null,
          passport_issued_at: row.issuing_office || null,
          source: row.asal || null,
        };

        // Remove null/empty fields biar DEFAULT DB jalan
        Object.keys(customerData).forEach((k) => {
          if (customerData[k] === null || customerData[k] === '') delete customerData[k];
        });

        // Defensive: coba insert dgn berbagai kombinasi field
        let newCust;
        try {
          const { data, error } = await supabase.from('customers').insert(customerData).select().single();
          if (error) throw error;
          newCust = data;
        } catch (e) {
          // Fallback minimal — hanya name + phone
          const minData = { name: row.full_name };
          if (row.phone) minData.phone = row.phone;
          const { data, error: err2 } = await supabase.from('customers').insert(minData).select().single();
          if (err2) throw new Error(`Customer insert failed: ${err2.message}`);
          newCust = data;
        }
        customerId = newCust.id;
        insertedCustomers++;
      }

      // Step 2: Insert trip_passenger
      const paxData = {
        trip_id: tripId,
        customer_id: customerId,
        room_type: row.room_type || null,
        room_code: row.room_code || null,
        price_paid: row.total_payment || null,
        joined_at: new Date().toISOString(),
      };
      Object.keys(paxData).forEach((k) => {
        if (paxData[k] === null || paxData[k] === '') delete paxData[k];
      });

      const { data: newPax, error: paxErr } = await supabase
        .from('trip_passengers').insert(paxData).select().single();
      if (paxErr) {
        errors.push(`${row.full_name}: trip_passenger insert failed — ${paxErr.message}`);
        continue;
      }
      insertedPax++;

      // Step 3: Insert payments — DP, P1, P2 yg ada nominalnya
      const paymentTypes = [
        { type: 'DP', amount: row.dp },
        { type: 'P1', amount: row.p1 },
        { type: 'P2', amount: row.p2 },
      ];
      for (const pt of paymentTypes) {
        if (!pt.amount || pt.amount <= 0) continue;
        try {
          await supabase.from('participant_payments').insert({
            passenger_id: newPax.id,
            amount: pt.amount,
            type: pt.type,
            paid_at: new Date().toISOString().slice(0, 10),
            notes: `Imported from Excel (row ${row.excel_row})`,
          });
          insertedPayments++;
        } catch (e) {
          errors.push(`${row.full_name} ${pt.type}: payment insert failed — ${e?.message}`);
        }
      }
    } catch (e) {
      errors.push(`${row.full_name}: ${e?.message || 'unknown error'}`);
    }
  }

  // Recalc trip stats
  try {
    const { data: allPax } = await supabase
      .from('trip_passengers')
      .select('id, transfer_status, refund_status')
      .eq('trip_id', tripId);

    const activeCount = (allPax || []).filter((p) => {
      const tr = p.transfer_status === 'transferred';
      const rf = p.refund_status === 'refunded' || p.refund_status === 'partial_refund';
      return !tr && !rf;
    }).length;

    const { data: tripRow } = await supabase.from('trips').select('quota').eq('id', tripId).maybeSingle();
    const quota = tripRow?.quota || 0;
    await supabase.from('trips').update({
      sold: activeCount,
      seat_left: Math.max(quota - activeCount, 0),
    }).eq('id', tripId);
  } catch {}

  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/finance/payments`);
  revalidatePath(`/finance/payments/${tripId}`);
  revalidatePath(`/finance/cashflow`);
  revalidatePath(`/accounting`);
  revalidatePath(`/invoices`);

  return {
    ok: true,
    inserted_customers: insertedCustomers,
    inserted_pax: insertedPax,
    inserted_payments: insertedPayments,
    skipped,
    errors: errors.slice(0, 20),
  };
}
