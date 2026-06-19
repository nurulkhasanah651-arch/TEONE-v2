// PDF Manifest (header biru, tabel bergaris). Client-side (jsPDF + autotable).
function shortDate(s) {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return String(s); }
}

const BLUE = [37, 99, 235];
const GREY = [243, 244, 246];

const COLS = ['No.', 'First Name', 'Last Name', 'Gender', 'Tempat Lahir', 'Tgl Lahir', 'Umur', 'No. Paspor', 'Tgl Issue', 'Issuing Office', 'Tgl Expired', 'No. HP'];
const W = [8, 28, 28, 12, 26, 22, 10, 26, 22, 28, 22, 26];

export async function downloadManifestPDF({ trip = {}, rows = [] }) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const tableW = W.reduce((a, b) => a + b, 0);
  const leftMargin = Math.max(8, (pageW - tableW) / 2);

  const titleLine = `MANIFEST ${trip.name || ''}${trip.kode_trip ? ` (${trip.kode_trip})` : ''}`.trim();
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

  const columnStyles = {};
  W.forEach((w, i) => { columnStyles[i] = { cellWidth: w }; });
  [0, 3, 6].forEach((i) => { columnStyles[i] = Object.assign({}, columnStyles[i], { halign: 'center' }); });

  autoTable(doc, {
    head: [COLS],
    body: rows.map((r) => r.map((c) => (c === null || c === undefined) ? '' : String(c))),
    startY: sub ? 22 : 16,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.3, lineColor: [180, 190, 205], lineWidth: 0.2, textColor: [30, 30, 30], valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: BLUE, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 7, lineColor: BLUE },
    alternateRowStyles: { fillColor: GREY },
    columnStyles,
    margin: { left: leftMargin, right: 8 },
  });

  const fileName = `Manifest - ${trip.kode_trip || trip.name || 'trip'}.pdf`;
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
