// PDF Roomlist (sesuai template TE): header biru, tabel bergaris, Room Type merge per kamar,
// kolom paspor/tempat-tgl lahir/umur, ringkasan jumlah kamar. Client-side (jsPDF + autotable).

const RT_LABEL = { single: 'SINGLE', twin: 'TWIN', double: 'DOUBLE', triple: 'TRIPLE', quad: 'QUAD', family: 'FAMILY' };
function rtLabel(t) { return RT_LABEL[String(t || '').toLowerCase()] || String(t || '').toUpperCase(); }
function shortDate(s) {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return String(s); }
}

const BLUE = [37, 99, 235];        // header biru (blue-600)
const BLUE_SOFT = [219, 234, 254]; // baris Room Type (blue-100)
const GREY = [243, 244, 246];      // zebra

const COLS = [
  'No.', 'First Name / Given Name', 'Surname', 'Title', 'Room Type',
  'No Room', 'No Room', 'Remarks', 'Req Meals', 'Req Seat',
  'Passport No / KTP', 'Place Of Birth', 'Birthdate', 'Age',
];
// lebar kolom (mm) - total ~272mm, muat di A4 landscape (usable ~281mm)
const W = [8, 38, 28, 12, 16, 12, 12, 18, 16, 14, 32, 26, 22, 8];

export async function downloadRoomlistPDF({ trip = {}, rooms = [] }) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const tableW = W.reduce((a, b) => a + b, 0);
  const leftMargin = Math.max(8, (pageW - tableW) / 2);

  // ---- Judul ----
  const titleLine = `ROOMLIST ${trip.name || ''}${trip.kode_trip ? ` (${trip.kode_trip})` : ''}`.trim();
  const dep = shortDate(trip.departure);
  const ret = shortDate(trip.return_date || trip.arrival);
  const sub = dep || ret ? `${dep}${ret ? ` - ${ret}` : ''}` : '';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
  doc.text(titleLine, pageW / 2, 12, { align: 'center' });
  if (sub) {
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text(sub, pageW / 2, 18, { align: 'center' });
  }

  // ---- Body tabel (Room Type merge per kamar) ----
  const body = [];
  const counts = {};
  let no = 1;
  for (const room of rooms) {
    const members = room.members || [];
    const rt = rtLabel(room.room_type);
    counts[rt] = (counts[rt] || 0) + 1;
    if (!members.length) {
      body.push([
        '', '', '', '',
        { content: rt, styles: { fillColor: BLUE_SOFT, fontStyle: 'bold', halign: 'center', valign: 'middle' } },
        '', '', room.label || '', '', '', '', '', '', '',
      ]);
      continue;
    }
    members.forEach((m, i) => {
      const base = [
        String(no++),
        m.first_name || m.name || '',
        m.surname || '',
        m.title || '',
      ];
      if (i === 0) {
        base.push({ content: rt, rowSpan: members.length, styles: { fillColor: BLUE_SOFT, fontStyle: 'bold', halign: 'center', valign: 'middle' } });
      }
      base.push(
        '', '',
        m.remarks || '',
        m.req_meals || '',
        m.req_seat || '',
        m.passport_no || '',
        m.place_of_birth || '',
        m.birth_date ? shortDate(m.birth_date) : '',
        (m.age === 0 || m.age) ? String(m.age) : '',
      );
      body.push(base);
    });
  }

  const columnStyles = {};
  W.forEach((w, i) => { columnStyles[i] = { cellWidth: w }; });
  [0, 3, 5, 6, 8, 9, 13].forEach((i) => { columnStyles[i] = Object.assign({}, columnStyles[i], { halign: 'center' }); });

  autoTable(doc, {
    head: [COLS],
    body,
    startY: sub ? 22 : 16,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.3, lineColor: [180, 190, 205], lineWidth: 0.2, textColor: [30, 30, 30], valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 7, lineColor: BLUE },
    alternateRowStyles: { fillColor: GREY },
    columnStyles,
    margin: { left: leftMargin, right: 8 },
  });

  // ---- Ringkasan jumlah kamar ----
  let totalRooms = 0;
  const sumBody = [];
  for (const t of ['SINGLE', 'TWIN', 'DOUBLE', 'TRIPLE', 'QUAD', 'FAMILY']) {
    if (counts[t]) { sumBody.push([t, String(counts[t])]); totalRooms += counts[t]; }
  }
  sumBody.push([{ content: 'TOTAL KAMAR', styles: { fontStyle: 'bold' } }, { content: String(totalRooms), styles: { fontStyle: 'bold' } }]);

  autoTable(doc, {
    body: sumBody,
    startY: (doc.lastAutoTable && doc.lastAutoTable.finalY ? doc.lastAutoTable.finalY : 30) + 5,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.5, lineColor: [180, 190, 205], lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 32, fontStyle: 'bold', fillColor: BLUE_SOFT }, 1: { cellWidth: 16, halign: 'center' } },
    margin: { left: leftMargin },
    tableWidth: 'wrap',
  });

  const fileName = `Roomlist - ${trip.kode_trip || trip.name || 'trip'}.pdf`;
  doc.save(fileName);
}
