'use server';
// Export 1 trip ke Excel multi-sheet — mirror format Google Sheet Master Trip
// (Master Info, Client Data, Manifest, Payment Checklist, Refund) + tambah Status Visa,
// dan Final Roomlist versi TERBARU (live regenerate). Tidak mengubah sync Google yg ada.
import { createClient } from '@/lib/supabase/server';
import { assertStaff } from '@/lib/auth/require-staff';
import { generateRoomlist, normalizeGender } from '@/lib/utils/roomlist';

const fmt = (v) => (v == null ? '' : String(v));
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return String(d);
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}
function calcAge(b) {
  if (!b) return '';
  const dob = new Date(b); if (isNaN(dob)) return '';
  const t = new Date(); let a = t.getFullYear() - dob.getFullYear();
  const m = t.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < dob.getDate())) a--;
  return a;
}
function passportValidity(exp, dep) {
  if (!exp) return '';
  const e = new Date(exp); if (isNaN(e)) return '';
  const base = dep ? new Date(dep) : new Date();
  const months = (e.getFullYear() - base.getFullYear()) * 12 + (e.getMonth() - base.getMonth());
  if (months < 6) return `⚠ ${months} bln (kurang dari 6)`;
  return `${months} bln`;
}
function titleFromGender(g) {
  const s = String(g || '').toUpperCase();
  if (s.startsWith('M') || s === 'L' || s === 'LAKI-LAKI') return 'Mr';
  if (s.startsWith('F') || s === 'P' || s === 'PEREMPUAN') return 'Mrs';
  return '';
}
function sexNorm(g) {
  const s = String(g || '').toUpperCase();
  if (s.startsWith('M') || s === 'L') return 'L';
  if (s.startsWith('F') || s === 'P') return 'P';
  return '';
}

export async function getTripExportData(tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/trips');
  if (g.error) return { error: g.error };
  if (!tripId) return { error: 'tripId kosong' };

  const { data: trip } = await supabase.from('trips')
    .select('*').eq('id', tripId).maybeSingle();
  if (!trip) return { error: 'Trip tidak ditemukan' };

  const { data: passengers } = await supabase.from('trip_passengers')
    .select('*').eq('trip_id', tripId).order('joined_at', { ascending: true });
  const paxList = passengers || [];
  const isOut = (p) => p.status === 'cancelled' || p.transfer_status === 'transferred'
    || p.refund_status === 'refunded' || p.refund_status === 'partial_refund';
  const activePax = paxList.filter((p) => !isOut(p));
  const outPax = paxList.filter(isOut);
  const custIds = paxList.map((p) => p.customer_id).filter(Boolean);
  let customers = [];
  if (custIds.length) { const { data: c } = await supabase.from('customers').select('*').in('id', custIds); customers = c || []; }
  const custMap = Object.fromEntries(customers.map((c) => [c.id, c]));

  const paxIds = paxList.map((p) => p.id);
  let payments = [];
  if (paxIds.length) { const { data: pay } = await supabase.from('participant_payments').select('*').in('passenger_id', paxIds); payments = pay || []; }
  let refundRows = [];
  try { const { data: rf } = await supabase.from('refunds').select('*').eq('trip_id', tripId); refundRows = rf || []; } catch {}

  const departure = trip.departure;
  const kodeTrip = trip.kode_trip || '';
  const nm = (c) => c.name || `${c.first_name || ''} ${c.surname || ''}`.trim();

  // Keterangan keluarga (per family_group_id, >=2 aktif)
  const famCount = {};
  for (const p of activePax) if (p.family_group_id) famCount[p.family_group_id] = (famCount[p.family_group_id] || 0) + 1;
  const famNo = {}; let fc = 0;
  for (const p of activePax) { const fg = p.family_group_id; if (fg && famCount[fg] >= 2 && !(fg in famNo)) famNo[fg] = ++fc; }
  const ketKeluarga = (p) => (p.family_group_id && famCount[p.family_group_id] >= 2) ? `Keluarga ${famNo[p.family_group_id]} (${famCount[p.family_group_id]} org)` : '-';

  // ===== Master Info =====
  const masterInfo = [
    ['MASTER TRIP', fmt(trip.name)],
    ['KODE TRIP', kodeTrip],
    ['TANGGAL', `${fmtDate(trip.departure)} - ${fmtDate(trip.return_date || trip.arrival)}`],
    ['TARGET SEAT', fmt(trip.quota)],
    ['Harga Full Trip', fmt(trip.price)],
    [''],
    ['Total Peserta Aktif', activePax.length],
    ['Total Peserta Daftar', paxList.length],
    ['Peserta Refund/Pindah', outPax.length],
    [''],
    ['Di-export', new Date().toLocaleString('id-ID')],
    ['Oleh', user.email || 'system'],
  ];

  // ===== Client Data =====
  const clientData = [
    ['No.', 'Kode Booking', 'First Name', 'Surname', 'Title', 'Sex', 'Phone (wa)', 'Room Type', 'Room Code',
     'Asal Peserta', 'Fasilitas', 'Keterangan', 'Paid Asuransi', 'Paid Visa',
     'Passport/KTP', 'Place Of Birth', 'Birthdate', 'Age', 'Issue Date', 'ExpDate', 'Issuing Office', 'Validity Paspor', 'Harga (Rp)'],
    ...activePax.map((p, i) => {
      const c = custMap[p.customer_id] || {};
      const first = c.first_name || (c.name ? c.name.split(' ')[0] : '');
      const surname = c.surname || c.last_name || (c.name ? c.name.split(' ').slice(1).join(' ') : '');
      const kode = kodeTrip ? `${kodeTrip}/${String(i + 1).padStart(3, '0')}` : '';
      return [
        i + 1, kode, fmt(first), fmt(surname), titleFromGender(c.gender || c.sex), sexNorm(c.gender || c.sex),
        fmt(c.phone || c.whatsapp), fmt(p.room_type), fmt(p.room_code || ''),
        fmt(c.source || c.asal || ''), fmt(p.fasilitas || 'Full Trip'), ketKeluarga(p),
        (p.paid_asuransi || p.include_asuransi) ? 'TRUE' : 'FALSE', (p.paid_visa || p.include_visa) ? 'TRUE' : 'FALSE',
        fmt(c.passport_no || c.passport_number || c.ktp || ''), fmt(c.place_of_birth || c.city || ''),
        fmtDate(c.birthdate || c.date_of_birth || c.birthday), calcAge(c.birthdate || c.date_of_birth || c.birthday),
        fmtDate(c.passport_issued_date || c.issue_date), fmtDate(c.passport_expiry || c.expiry_date),
        fmt(c.passport_issued_at || c.issuing_office || ''), passportValidity(c.passport_expiry || c.expiry_date, departure),
        Number(p.price_paid) || 0,
      ];
    }),
  ];

  // ===== Manifest =====
  const manifest = [
    [`MANIFEST ${trip.name || ''}`], [`${fmtDate(trip.departure)} - ${fmtDate(trip.return_date || trip.arrival)}`], [''],
    ['No.', 'First Name', 'Surname', 'Title', 'Gender', 'Passport/KTP', 'Place Of Birth', 'Birthdate', 'Age', 'Issue Date', 'ExpDate', 'Issuing Office', 'No. HP', 'Keterangan'],
    ...activePax.map((p, i) => {
      const c = custMap[p.customer_id] || {};
      const first = c.first_name || (c.name ? c.name.split(' ')[0] : '');
      const surname = c.surname || c.last_name || (c.name ? c.name.split(' ').slice(1).join(' ') : '');
      return [
        i + 1, fmt(first), fmt(surname), titleFromGender(c.gender || c.sex), sexNorm(c.gender || c.sex),
        fmt(c.passport_no || c.passport_number || c.ktp || ''), fmt(c.place_of_birth || c.city || ''),
        fmtDate(c.birthdate || c.date_of_birth || c.birthday), calcAge(c.birthdate || c.date_of_birth || c.birthday),
        fmtDate(c.passport_issued_date || c.issue_date), fmtDate(c.passport_expiry || c.expiry_date),
        fmt(c.passport_issued_at || c.issuing_office || ''), fmt(c.phone || c.whatsapp), ketKeluarga(p),
      ];
    }),
  ];

  // ===== Payment Checklist =====
  const tpl = (trip.payment_template && typeof trip.payment_template === 'object') ? trip.payment_template : {};
  const msKeys = Object.keys(tpl).length ? Object.keys(tpl) : ['DP', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'Pelunasan', 'Visa'];
  const paymentChecklist = [
    ['No.', 'Nama Peserta', 'Phone', 'Room Type', 'Harga (Rp)', ...msKeys, 'Total Paid', 'Sisa', 'Status', 'Progress'],
    ...activePax.map((p, i) => {
      const c = custMap[p.customer_id] || {};
      const pp = payments.filter((x) => x.passenger_id === p.id && !x.is_transferred);
      const harga = Number(p.price_paid) || 0;
      const per = msKeys.map((m) => { const py = pp.find((x) => { const t = (x.type || '').toLowerCase(); return t === m.toLowerCase() || t.includes(m.toLowerCase()); }); return py ? Number(py.amount) || 0 : ''; });
      const total = pp.reduce((s, x) => s + (Number(x.amount) || 0), 0);
      const sisa = harga - total;
      return [i + 1, fmt(nm(c)), fmt(c.phone), fmt(p.room_type), harga, ...per, total, sisa,
        sisa <= 0 ? 'LUNAS' : total > 0 ? 'CICILAN' : 'BELUM BAYAR', harga > 0 ? `${Math.round((total / harga) * 100)}%` : '-'];
    }),
  ];

  // ===== Status Visa =====
  const statusVisa = [
    ['No.', 'Nama Peserta', 'Phone', 'Room Type', 'Include Visa', 'Negara', 'Tipe Visa', 'Status Dokumen', 'Status Visa',
     'Nomor Visa', 'Berlaku Dari', 'Berlaku Sampai', 'Hasil', 'Appointment', 'Biometrik', 'Catatan'],
    ...activePax.map((p, i) => {
      const c = custMap[p.customer_id] || {};
      return [i + 1, fmt(nm(c)), fmt(c.phone), fmt(p.room_type),
        p.include_visa ? 'YA' : '-', fmt(p.visa_country || trip.visa_country || ''), fmt(p.visa_type || ''),
        fmt(p.visa_docs_status || ''), fmt(p.visa_status || ''), fmt(p.visa_number || ''),
        fmtDate(p.visa_valid_from), fmtDate(p.visa_valid_until), fmt(p.visa_result || ''),
        fmtDate(p.visa_appointment_date), fmtDate(p.visa_biometric_date), fmt(p.visa_notes || '')];
    }),
  ];

  // ===== Final Roomlist (LIVE regenerate — versi terbaru) =====
  const rooms = generateRoomlist(activePax, customers);
  const roomlist = [
    [`ROOMLIST TERBARU — ${trip.name || ''} (live)`], [''],
    ['Room#', 'Type', 'Cap', 'Label', 'Gender', 'Pax 1', 'Pax 2', 'Pax 3', 'Pax 4', 'Note'],
    ...rooms.map((r) => {
      const names = [0, 1, 2, 3].map((k) => {
        const px = r.pax[k]; if (!px) return '';
        const c = custMap[px.customer_id] || {};
        const gg = normalizeGender({ ...px, gender: c.gender || c.sex });
        return `${c.name || `#${px.id}`}${gg !== '?' ? ` (${gg})` : ''}`;
      });
      return [r.room_no, (r.room_type || '').toUpperCase(), r.capacity, fmt(r.label),
        r.is_family ? 'FAMILY' : r.gender === 'M' ? 'COWOK' : r.gender === 'F' ? 'CEWEK' : '?',
        ...names, r.needs_upgrade ? `🔔 ${r.upgrade_note || 'NEED UPGRADE'}` : ''];
    }),
  ];

  // ===== Refund / Pindah =====
  const refund = [
    [`REFUND & PINDAH TRIP — ${trip.name || ''}`], [''],
    ['No.', 'Nama Peserta', 'Phone', 'Tipe', 'Alasan', 'Total Dibayar', 'Jumlah Refund', 'Admin Fee', 'Status', 'Tanggal', 'Pindah ke Trip'],
    ...outPax.map((p, i) => {
      const c = custMap[p.customer_id] || {};
      const isTrf = p.transfer_status === 'transferred';
      const rf = refundRows.find((r) => String(r.passenger_id) === String(p.id)) || {};
      return [i + 1, fmt(nm(c)), fmt(c.phone || c.whatsapp), isTrf ? 'PINDAH TRIP' : 'REFUND',
        fmt(rf.reason || p.refund_reason || p.transfer_reason || ''), Number(rf.total_paid ?? p.price_paid) || 0,
        isTrf ? '' : (Number(rf.refund_amount ?? p.refund_amount) || 0), isTrf ? '' : (Number(rf.admin_fee) || 0),
        fmt(rf.status || (isTrf ? 'transferred' : p.refund_status || '')),
        fmtDate(rf.approved_at || rf.created_at || p.refunded_at || p.transferred_at), isTrf ? fmt(p.transferred_to_trip_id || '') : ''];
    }),
  ];

  const tabs = [
    { name: 'Master Info', rows: masterInfo },
    { name: 'Client Data', rows: clientData },
    { name: 'Manifest', rows: manifest },
    { name: 'Payment Checklist', rows: paymentChecklist },
    { name: 'Status Visa', rows: statusVisa },
    { name: 'Roomlist', rows: roomlist },
    { name: 'Refund', rows: refund },
  ];
  return { ok: true, kode: kodeTrip || fmt(trip.name), name: trip.name || '', tabs };
}
