// Dana hangus trip CANCELLED = deposit/tiket MASKAPAI yang tidak bisa ditarik lagi.
// Saat trip batal, biaya yang tetap nyangkut untuk TravelingEropa adalah tiket/deposit
// maskapai; komponen lain (hotel, handling, tipping, TL, dll) dianggap tidak hangus.
// Dipakai di Estimate Profit (group) & Cashflow (group) supaya trip cancelled TIDAK hilang
// dari laporan — ikut terhitung sebagai kerugian sebesar deposit maskapai.
const _num = (v) => { if (v === '' || v == null) return 0; const n = Number(String(v).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const _kurs = (v) => { const n = _num(v); return n > 0 ? n : 1; };
const FLIGHT_RE = /(international\s*flight|penerbangan|maskapai|pesawat|tiket|air\s*fare|airfare|\bflight\b)/i;
const DISKON_RE = /diskon|discount/i;

// saved = baris profit_estimate (punya .expense_rows). Return nilai deposit maskapai (IDR).
export function airlineHangusFromEstimate(saved) {
  const rows = (saved && Array.isArray(saved.expense_rows)) ? saved.expense_rows : [];
  if (!rows.length) return 0;
  const nonHotel = rows.filter((e) => e && e.type !== 'hotel');
  const lineVal = (e) => _num(e.unit_cost) * _kurs(e.kurs) * _num(e.qty);
  let sum = 0; let matched = 0;
  for (const e of nonHotel) {
    const cat = `${e.category || ''} ${e.component || ''}`;
    if (DISKON_RE.test(cat)) continue;        // baris diskon tiket → bukan deposit hangus
    if (FLIGHT_RE.test(cat)) { sum += lineVal(e); matched += 1; }
  }
  if (matched > 0) return sum;
  // Fallback estimate lama tanpa label: kalau cuma ada 1 baris biaya non-hotel non-diskon,
  // anggap baris itu tiket maskapai.
  const single = nonHotel.filter((e) => !DISKON_RE.test(`${e.category || ''} ${e.component || ''}`));
  if (single.length === 1) return lineVal(single[0]);
  return 0;
}
