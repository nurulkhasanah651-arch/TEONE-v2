// PDF Roomlist — FORMAT MANIFEST, dikelompokkan per kamar (roomlist).
// Kolom sama seperti Manifest (No, Nama, Gender, Tempat/Tgl Lahir, Umur, Paspor, Issue,
// Issuing Office, Expired, HP) + kolom "Room Type" (digabung per kamar) & "Catatan / Request"
// di sampingnya. Tanpa kolom "No Room". NIK/Alamat KTP muncul hanya bila ada data (Khasanah).
// Client-side (jsPDF + autotable).

const RT_LABEL = { single: 'SINGLE', twin: 'TWIN', double: 'DOUBLE', triple: 'TRIPLE', quad: 'QUAD', family: 'FAMILY' };
function rtLabel(t) { return RT_LABEL[String(t || '').toLowerCase()] || String(t || '').toUpperCase(); }
function shortDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function genderLP(g) {
  const s = String(g || '').toUpperCase();
  if (s === 'M' || s === 'L') return 'L';
  if (s === 'F' || s === 'P') return 'P';
  return '';
}

const BLUE = [37, 99, 235];        // header biru
const BLUE_SOFT = [219, 234, 254]; // sel Room Type
const GREY = [243, 244, 246];      // zebra

export async function downloadRoomlistPDF({ trip = {}, rooms = [] }) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  // NIK/Alamat KTP hanya kalau ada datanya (Khasanah). TEONE tidak berubah.
  const showKtp = (rooms || []).some((r) => (r.members || []).some((m) => m && (m.nik || m.ktp_alamat)));

  // Kolom mengikuti Manifest + Room Type + Catatan (tanpa No Room).
  const COLS = [
    'No.', 'First Name', 'Last Name', 'Gender', 'Tempat Lahir', 'Tgl Lahir', 'Umur', 'No. Paspor',
    ...(showKtp ? ['NIK', 'Alamat KTP'] : []),
    'Tgl Issue', 'Issuing Office', 'Tgl Expired', 'Room Type', 'Catatan / Request',
  ];
  const W = showKtp
    ? [6, 18, 18, 7, 15, 14, 6, 17, 18, 22, 13, 17, 13, 15, 18]
    : [7, 24, 24, 9, 20, 16, 7, 20, 16, 20, 16, 16, 34];
  // Index kolom Room Type & Catatan (dua kolom terakhir)
  const RT_IDX = COLS.length - 2;

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

  // ---- Body: baris manifest, dikelompokkan per kamar (Room Type digabung/merge) ----
  const body = [];
  const counts = {};
  let no = 1;

  const preCells = (m) => [
    String(no++),
    m.first_name || (m.name ? String(m.name).split(' ')[0] : '') || '',
    m.surname || m.last_name || '',
    genderLP(m.gender),
    m.place_of_birth || '',
    m.birth_date || shortDate(m.birth_raw) || '',
    (m.age === 0 || m.age) ? String(m.age) : '',
    m.passport_no || '',
    ...(showKtp ? [m.nik || '', m.ktp_alamat || ''] : []),
    m.issue_date || '',
    m.issuing_office || '',
    m.expiry_date || '',
  ];

  for (const room of rooms) {
    const members = room.members || [];
    const rt = rtLabel(room.room_type);
    counts[rt] = (counts[rt] || 0) + 1;
    const roomNote = room.note || '';

    if (!members.length) {
      const row = [
        '', '', '', '', '', '', '', '',
        ...(showKtp ? ['', ''] : []),
        '', '', '',
        { content: rt, styles: { fillColor: BLUE_SOFT, fontStyle: 'bold', halign: 'center', valign: 'middle' } },
        room.label || roomNote || '',
      ];
      body.push(row);
      continue;
    }

    members.forEach((m, i) => {
      const row = preCells(m);
      if (i === 0) {
        row.push({ content: rt, rowSpan: members.length, styles: { fillColor: BLUE_SOFT, fontStyle: 'bold', halign: 'center', valign: 'middle' } });
      }
      // Catatan: catatan peserta + (kalau ada) catatan kamar pada baris pertama
      const catatan = [m.catatan || m.remarks || '', (i === 0 && roomNote) ? roomNote : ''].filter(Boolean).join(' · ');
      row.push(catatan);
      body.push(row);
    });
  }

  const columnStyles = {};
  W.forEach((w, i) => { columnStyles[i] = { cellWidth: w }; });
  // rata tengah: No., Gender, Umur, Room Type
  [0, 3, 6, RT_IDX].forEach((i) => { columnStyles[i] = Object.assign({}, columnStyles[i], { halign: 'center' }); });

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
  savePdfForceDownload(doc, fileName);
}

// Paksa unduh (jangan preview inline di HP/iOS): blob octet-stream + anchor download
function savePdfForceDownload(doc, fileName) {
  try {
    const pdfBlob = doc.output('blob');
    const blob = new Blob([pdfBlob], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) {
    try { doc.save(fileName); } catch {}
  }
}
