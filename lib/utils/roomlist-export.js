// Format Excel Roomlist (sesuai template TE): header trip+tanggal, baris per peserta,
// Room Type sekali per kamar (merge), kolom paspor/tempat-tgl lahir/umur, ringkasan jumlah kamar.
const RT_LABEL = { single: 'SINGLE', twin: 'TWIN', double: 'DOUBLE', triple: 'TRIPLE', quad: 'QUAD', family: 'FAMILY' };
function rtLabel(t) { return RT_LABEL[String(t || '').toLowerCase()] || String(t || '').toUpperCase(); }
function shortDate(s) {
  if (!s) return '';
  try {
    return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return String(s); }
}

export function buildRoomlistAOA({ trip = {}, rooms = [] }) {
  // Kolom & urutan DISAMAKAN dengan PDF roomlist (lib/utils/roomlist-pdf.js) supaya
  // Excel & PDF identik. Room Type di-merge per kamar; No Room x2 diisi TL.
  const COLS = ['No.', 'First Name / Given Name', 'Surname', 'Title', 'Room Type', 'No Room', 'No Room', 'Remarks / Catatan', 'Passport No / KTP', 'Place Of Birth', 'Birthdate', 'Age'];
  const NCOL = COLS.length;
  const titleLine = `ROOMLIST ${trip.name || ''}${trip.kode_trip ? ` (${trip.kode_trip})` : ''}`.trim();
  const dep = shortDate(trip.departure);
  const ret = shortDate(trip.return_date || trip.arrival);
  const sub = dep || ret ? `${dep}${ret ? ` - ${ret}` : ''}` : '';

  const aoa = [[titleLine], [sub], [], COLS];
  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: NCOL - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: NCOL - 1 } },
  ];
  let rowIdx = 4;
  let no = 1;
  const counts = {};

  for (const room of rooms) {
    const members = room.members || [];
    const rt = rtLabel(room.room_type);
    counts[rt] = (counts[rt] || 0) + 1;
    if (!members.length) {
      aoa.push(['', '', '', '', rt, '', '', room.label || '', '', '', '', '']);
      rowIdx += 1;
      continue;
    }
    const startRow = rowIdx;
    members.forEach((m, i) => {
      aoa.push([
        no++,
        m.first_name || m.name || '',
        m.surname || '',
        m.title || '',
        i === 0 ? rt : '',
        '', '',                       // No Room x2 (diisi TL)
        m.remarks || '',
        m.passport_no || '',
        m.place_of_birth || '',
        shortDate(m.birth_raw || m.birth_date),
        (m.age === 0 || m.age) ? m.age : '',
      ]);
      rowIdx += 1;
    });
    if (members.length > 1) merges.push({ s: { r: startRow, c: 4 }, e: { r: startRow + members.length - 1, c: 4 } });
  }

  // Ringkasan jumlah KAMAR per tipe
  aoa.push([]);
  let totalRooms = 0;
  for (const t of ['SINGLE', 'TWIN', 'DOUBLE', 'TRIPLE', 'QUAD', 'FAMILY']) {
    if (counts[t]) { aoa.push(['', '', '', '', t, counts[t]]); totalRooms += counts[t]; }
  }
  aoa.push(['', '', '', '', 'TOTAL', totalRooms]);

  const cols = [{ wch: 5 }, { wch: 28 }, { wch: 20 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 26 }, { wch: 20 }, { wch: 18 }, { wch: 13 }, { wch: 5 }];
  return { aoa, merges, cols, sheetName: 'Roomlist', fileName: `Roomlist - ${trip.kode_trip || trip.name || 'trip'}.xlsx`, headerRows: 4 };
}
