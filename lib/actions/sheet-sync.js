'use server';

// R216d: FIX field name mismatch — pakai field name yg sama dgn Passport AI form (canonical)
// FIX: birthdate → birthday, surname → last_name, place_of_birth → city
// + bonus: insert nationality kalau ada
// SEMUA logic R216c (family grouping, defensive insert) TETAP UTUH
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
  const cleaned = String(v).replace(/[^\d-]/g, '');
  return Number(cleaned) || 0;
}

function parsePaxMarker(name) {
  if (!name) return { paxCount: 0, cleanName: name };
  const m = String(name).match(/\((\d+)\s*PAX(?:\s*\+\s*(\d+)\s*C(?:N?B?))?\)/i);
  if (!m) return { paxCount: 0, cleanName: String(name).trim() };
  const adult = parseInt(m[1], 10) || 0;
  const cnb = m[2] ? parseInt(m[2], 10) : 0;
  const cleanName = String(name).replace(/\(.*?\)/, '').trim();
  return { paxCount: adult + cnb, cleanName };
}

// ============================================================
// STEP 1: PREVIEW
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

  const sheetName = workbook.SheetNames.find((n) => /client.?data/i.test(n));
  if (!sheetName) {
    return { error: `Sheet "Client Data" gak ketemu. Sheet yg ada: ${workbook.SheetNames.join(', ')}` };
  }
  const sheet = workbook.Sheets[sheetName];

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
      range: 11,
      header: HEADER_KEYS,
      defval: null,
      raw: false,
    });
  } catch (e) {
    return { error: 'Gagal parse Client Data sheet: ' + (e?.message || 'unknown') };
  }

  const validRows = rawRows.filter((r) => r.first_name && String(r.first_name).trim());

  if (validRows.length === 0) {
    return { error: 'Tidak ada peserta di Excel (semua baris First Name kosong)' };
  }

  const { data: trip } = await supabase.from('trips').select('id, kode_trip, name').eq('id', tripId).maybeSingle();
  if (!trip) return { error: 'Trip gak ditemukan' };

  const { data: existingPax } = await supabase
    .from('trip_passengers').select('id, customer_id').eq('trip_id', tripId);
  const existingPaxCustIds = new Set((existingPax || []).map((p) => p.customer_id).filter(Boolean));

  // R216d: include both possible field names for matching
  const { data: allCustomers } = await supabase
    .from('customers').select('id, name, first_name, last_name, surname, phone, whatsapp, passport_no');

  const custByPassport = {};
  const custByPhone = {};
  const custByName = {};
  for (const c of (allCustomers || [])) {
    const pp = normPassport(c.passport_no);
    if (pp) custByPassport[pp] = c;
    const ph = normPhone(c.phone || c.whatsapp);
    if (ph) custByPhone[ph] = c;
    const lastName = c.last_name || c.surname || '';
    const nn = normName(c.name || `${c.first_name || ''} ${lastName}`);
    if (nn) custByName[nn] = c;
  }

  // FAMILY GROUPING
  let currentFamilyHead = null;
  let remainingInFamily = 0;

  const previewRows = validRows.map((r, idx) => {
    const rawFirstName = String(r.first_name || '').trim();
    const { paxCount, cleanName: cleanFirstName } = parsePaxMarker(rawFirstName);
    const surname = String(r.surname || '').trim();
    const fullName = `${cleanFirstName} ${surname}`.trim();

    let familyRole = '';
    let familyHeadName = null;
    let familyTotalPax = 0;

    if (paxCount > 1) {
      familyRole = 'head';
      familyHeadName = cleanFirstName;
      familyTotalPax = paxCount;
      currentFamilyHead = cleanFirstName;
      remainingInFamily = paxCount - 1;
    } else if (paxCount === 1) {
      familyRole = 'solo';
      currentFamilyHead = null;
      remainingInFamily = 0;
    } else {
      if (remainingInFamily > 0 && currentFamilyHead) {
        familyRole = 'member';
        familyHeadName = currentFamilyHead;
        remainingInFamily--;
      } else {
        familyRole = 'solo';
      }
    }

    const passportRaw = r.passport_no;
    const passportNorm = normPassport(passportRaw);
    const phoneNorm = normPhone(r.phone);
    const nameNorm = normName(fullName);

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
      excel_row: idx + 12,
      first_name: cleanFirstName,
      surname: surname,
      full_name: fullName,
      original_name: rawFirstName,
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
      dp, p1, p2,
      total_payment: totalPayment,
      match_status: status,
      match_via: matchVia,
      matched_customer_id: matchedCustomer?.id || null,
      matched_customer_name: matchedCustomer?.name || null,
      family_role: familyRole,
      family_head_name: familyHeadName,
      family_total_pax: familyTotalPax,
    };
  });

  const stats = {
    total: previewRows.length,
    new_customer: previewRows.filter((r) => r.match_status === 'new_customer').length,
    existing_customer: previewRows.filter((r) => r.match_status === 'existing_customer').length,
    skip: previewRows.filter((r) => r.match_status === 'skip').length,
    total_payment: previewRows.reduce((s, r) => s + r.total_payment, 0),
    families: previewRows.filter((r) => r.family_role === 'head').length,
    solo_travelers: previewRows.filter((r) => r.family_role === 'solo').length,
    family_members: previewRows.filter((r) => r.family_role === 'member').length,
  };

  return { ok: true, trip: { id: trip.id, kode_trip: trip.kode_trip, name: trip.name }, rows: previewRows, stats };
}

// ============================================================
// STEP 2: CONFIRM (R216d: CORRECT FIELD NAMES match Passport AI)
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
  let insertedFamilies = 0;
  let skipped = 0;
  const errors = [];

  // STEP A — Create family_groups untuk semua head (paxCount > 1)
  const familyGroupMap = {};

  for (const row of rows) {
    if (row.family_role !== 'head') continue;
    if (row.match_status === 'skip') continue;
    if (row.family_total_pax <= 1) continue;

    try {
      const familyName = `${row.full_name} (${row.family_total_pax} PAX)`;
      const { data: fg, error: fgErr } = await supabase
        .from('family_groups').insert({ trip_id: tripId, name: familyName }).select().single();
      if (fgErr) {
        errors.push(`Family ${row.full_name}: ${fgErr.message}`);
        continue;
      }
      familyGroupMap[(row.family_head_name || '').toLowerCase()] = fg.id;
      insertedFamilies++;
    } catch (e) {
      errors.push(`Family group create ${row.full_name}: ${e?.message}`);
    }
  }

  // STEP B — Insert customers + trip_passengers + payments
  for (const row of rows) {
    if (row.match_status === 'skip') {
      skipped++;
      continue;
    }

    try {
      let customerId = row.matched_customer_id;

      // R216d FIX: Insert customer with CANONICAL field names (match Passport AI):
      // - last_name (NOT surname)
      // - birthday (NOT birthdate)
      // - city (NOT place_of_birth)
      // - gender, passport_no, passport_issued_at, passport_issued_date, passport_expiry ✓
      if (!customerId) {
        const customerData = {
          name: row.full_name,
          first_name: row.first_name,
          last_name: row.surname,          // R216d FIX: surname → last_name
          phone: row.phone || null,
          whatsapp: row.phone || null,
          gender: row.gender || null,      // L / P
          passport_no: row.passport_no || null,
          city: row.place_of_birth || null,   // R216d FIX: place_of_birth → city
          birthday: row.birthdate || null,    // R216d FIX: birthdate → birthday
          passport_issued_date: row.issue_date || null,
          passport_expiry: row.exp_date || null,
          passport_issued_at: row.issuing_office || null,
        };

        // Remove null/empty fields biar DEFAULT DB jalan
        Object.keys(customerData).forEach((k) => {
          if (customerData[k] === null || customerData[k] === '') delete customerData[k];
        });

        // Defensive insert — kalau ada column yg gak ada di DB, retry tanpa column itu
        let newCust;
        let { data, error } = await supabase.from('customers').insert(customerData).select().single();

        if (error && /column.*does not exist|could not find.*column/i.test(error.message)) {
          // Identify problematic columns
          const problematicCols = [];
          ['last_name', 'birthday', 'city', 'gender', 'passport_no', 'passport_issued_at',
           'passport_issued_date', 'passport_expiry', 'whatsapp'].forEach((col) => {
            if (error.message.includes(col)) problematicCols.push(col);
          });
          // Retry without problematic columns
          const safeData = { ...customerData };
          problematicCols.forEach((c) => delete safeData[c]);
          const { data: data2, error: err2 } = await supabase.from('customers').insert(safeData).select().single();
          if (err2) {
            // Last resort: minimal name only
            const minData = { name: row.full_name };
            if (row.phone) minData.phone = row.phone;
            const { data: data3, error: err3 } = await supabase.from('customers').insert(minData).select().single();
            if (err3) throw new Error(`Customer insert failed: ${err3.message}`);
            newCust = data3;
            errors.push(`${row.full_name}: ⚠ customer minimal insert (column missing: ${problematicCols.join(',')})`);
          } else {
            newCust = data2;
            errors.push(`${row.full_name}: ⚠ inserted tanpa column: ${problematicCols.join(', ')}`);
          }
        } else if (error) {
          // Other error — try minimal
          const minData = { name: row.full_name };
          if (row.phone) minData.phone = row.phone;
          const { data: data2, error: err2 } = await supabase.from('customers').insert(minData).select().single();
          if (err2) throw new Error(`Customer insert failed: ${err2.message}`);
          newCust = data2;
        } else {
          newCust = data;
        }

        customerId = newCust.id;
        insertedCustomers++;
      }

      // Insert trip_passenger
      const familyGroupId = row.family_head_name ? familyGroupMap[(row.family_head_name || '').toLowerCase()] : null;
      const isFamilyHead = row.family_role === 'head';

      const paxData = {
        trip_id: tripId,
        customer_id: customerId,
        room_type: row.room_type || null,
        room_code: row.room_code || null,
        price_paid: row.total_payment || null,
        joined_at: new Date().toISOString(),
        family_group_id: familyGroupId || null,
        is_family_head: isFamilyHead || false,
      };
      Object.keys(paxData).forEach((k) => {
        if (paxData[k] === null || paxData[k] === '') delete paxData[k];
      });

      let newPax;
      let { data, error: paxErr } = await supabase
        .from('trip_passengers').insert(paxData).select().single();

      if (paxErr && /column.*does not exist|could not find.*column/i.test(paxErr.message)) {
        const problematicCols = [];
        if (/room_code/i.test(paxErr.message)) problematicCols.push('room_code');
        if (/family_group_id/i.test(paxErr.message)) problematicCols.push('family_group_id');
        if (/is_family_head/i.test(paxErr.message)) problematicCols.push('is_family_head');

        const safePaxData = { ...paxData };
        problematicCols.forEach((col) => delete safePaxData[col]);

        const { data: data2, error: paxErr2 } = await supabase
          .from('trip_passengers').insert(safePaxData).select().single();

        if (paxErr2) {
          errors.push(`${row.full_name}: trip_passenger insert failed — ${paxErr2.message}`);
          continue;
        }
        newPax = data2;
        if (problematicCols.length > 0) {
          errors.push(`${row.full_name}: ⚠ inserted tanpa kolom: ${problematicCols.join(', ')}`);
        }
      } else if (paxErr) {
        errors.push(`${row.full_name}: trip_passenger insert failed — ${paxErr.message}`);
        continue;
      } else {
        newPax = data;
      }
      insertedPax++;

      // Insert payments
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
  revalidatePath(`/finance/cashflow/${tripId}`);
  revalidatePath(`/accounting`);
  revalidatePath(`/invoices`);
  revalidatePath(`/passport-manage`);

  return {
    ok: true,
    inserted_customers: insertedCustomers,
    inserted_pax: insertedPax,
    inserted_payments: insertedPayments,
    inserted_families: insertedFamilies,
    skipped,
    errors: errors.slice(0, 30),
  };
}
