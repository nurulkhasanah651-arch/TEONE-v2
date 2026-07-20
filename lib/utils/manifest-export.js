// Format Excel Manifest — kolom disamakan dgn manifest-pdf.js (+ Keterangan),
// dipakai di semua tempat (Operasional, Visa, Portal TL) supaya seragam.
function shortDate(s) {
  if (!s) return '';
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return String(s);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return String(s); }
}

export function buildManifestAOA({ trip = {}, rows = [] }) {
  const COLS = ['No.', 'First Name', 'Last Name', 'Gender', 'Tempat Lahir', 'Tgl Lahir', 'Umur', 'No. Paspor', 'Tgl Issue', 'Issuing Office', 'Tgl Expired', 'No. HP', 'Keterangan', 'Catatan / Request'];
  const NCOL = COLS.length;
  const titleLine = `MANIFEST ${trip.name || ''}${trip.kode_trip ? ` (${trip.kode_trip})` : ''}`.trim();
  const dep = shortDate(trip.departure);
  const ret = shortDate(trip.return || trip.return_date || trip.arrival);
  const sub = dep || ret ? `${dep}${ret ? ` - ${ret}` : ''}` : '';

  const aoa = [[titleLine], [sub], [], COLS];
  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: NCOL - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: NCOL - 1 } },
  ];
  for (const r of (rows || [])) {
    aoa.push([
      r.no, r.first_name, r.last_name, r.gender, r.place_of_birth, r.birth_date, r.age,
      r.passport_no, r.issue_date, r.issuing_office, r.expiry_date, r.phone, r.keterangan || '', r.catatan || '',
    ]);
  }
  const cols = [{ wch: 5 }, { wch: 18 }, { wch: 18 }, { wch: 7 }, { wch: 16 }, { wch: 13 }, { wch: 6 }, { wch: 18 }, { wch: 13 }, { wch: 18 }, { wch: 13 }, { wch: 16 }, { wch: 18 }, { wch: 28 }];
  return { aoa, merges, cols, sheetName: 'Manifest', fileName: `Manifest - ${trip.kode_trip || trip.name || 'trip'}.xlsx` };
}
