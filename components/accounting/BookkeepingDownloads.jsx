'use client';

// Tombol download dokumen pembukuan per trip:
//  - Invoice Peserta (ZIP PDF)   : 1 PDF invoice LENGKAP per peserta (format setara invoice web:
//                                  header PT, rincian, riwayat bayar + tanggal, total & sisa) → ZIP
//  - Rekap HPP Vendor (PDF)      : 1 PDF tabel biaya vendor
//  - Bukti Bayar Peserta (ZIP)   : file bukti dari Google Drive → server route
import { useState } from 'react';
import { buildTripInvoices } from '@/lib/actions/bookkeeping';

const fmt = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const safeName = (s, fb) => (String(s || fb || '').replace(/[^\w\- ]+/g, '').trim() || fb).slice(0, 45);

export default function BookkeepingDownloads({ trip, peserta = [], vendor = [], buktiCount = 0 }) {
  const [busy, setBusy] = useState('');

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
  }

  // Gambar 1 invoice ke dalam dokumen jsPDF (format menyerupai invoice web).
  function renderInvoice(doc, autoTableFn, company, tripInfo, inv) {
    const M = 14, W = 210, R = W - M;
    // Header band
    doc.setFillColor(30, 64, 120); doc.rect(0, 0, W, 40, 'F');
    doc.setTextColor(255); doc.setFont(undefined, 'bold'); doc.setFontSize(15);
    doc.text(String(company.name || '').toUpperCase(), M, 15);
    doc.setFont(undefined, 'normal'); doc.setFontSize(8);
    let hy = 21;
    if (company.address) { doc.text(doc.splitTextToSize(company.address, 110), M, hy); hy += 4 * doc.splitTextToSize(company.address, 110).length; }
    if (company.phone) { doc.text(`Telp: ${company.phone}`, M, hy); hy += 4; }
    if (company.email) { doc.text(`Email: ${company.email}`, M, hy); hy += 4; }
    if (company.npwp) { doc.text(`NPWP: ${company.npwp}`, M, hy); }
    doc.setFont(undefined, 'bold'); doc.setFontSize(9); doc.text('INVOICE', R, 10, { align: 'right' });
    doc.setFontSize(12); doc.text(String(inv.invoiceNo), R, 16, { align: 'right' });
    doc.setFont(undefined, 'normal'); doc.setFontSize(8);
    if (inv.milestone) doc.text(`Pembayaran: ${inv.milestone}`, R, 21, { align: 'right' });
    doc.text(`Tanggal: ${inv.tanggalFmt}`, R, 25, { align: 'right' });
    doc.setFont(undefined, 'bold'); doc.setFontSize(9); doc.text(inv.statusLabel || (inv.lunas ? 'LUNAS' : ''), R, 30, { align: 'right' });

    // Ditagih kepada / Trip
    doc.setTextColor(30); doc.setFontSize(8); doc.setFont(undefined, 'bold');
    doc.text('DITAGIH KEPADA', M, 50); doc.text('TRIP', R, 50, { align: 'right' });
    doc.setFont(undefined, 'normal'); doc.setFontSize(10);
    doc.text(inv.peserta.nama, M, 56);
    doc.setFontSize(8);
    let ly = 61;
    if (inv.peserta.phone) { doc.text(`Telp: ${inv.peserta.phone}`, M, ly); ly += 4; }
    if (inv.peserta.room) { doc.text(`Kamar: ${inv.peserta.room}`, M, ly); ly += 4; }
    doc.setFontSize(10); doc.text(doc.splitTextToSize(tripInfo.name, 80), R, 56, { align: 'right' });
    doc.setFontSize(8);
    doc.text(`${tripInfo.kode}`, R, 62, { align: 'right' });
    doc.text(`Berangkat: ${tripInfo.departureFmt}${tripInfo.returnFmt ? ' - ' + tripInfo.returnFmt : ''}`, R, 66, { align: 'right' });
    if (inv.paidFmt) doc.text(`Dibayar: ${inv.paidFmt}`, R, 70, { align: 'right' });
    else if (inv.dueFmt) doc.text(`Jatuh tempo: ${inv.dueFmt}`, R, 70, { align: 'right' });

    // Rincian tagihan
    autoTableFn(doc, {
      startY: 74,
      head: [['Rincian Tagihan', 'Jumlah']],
      body: inv.items.map((it) => [it.label + (it.detail ? `  (${it.detail})` : ''), fmt(it.amount)]),
      foot: [['TOTAL TAGIHAN', fmt(inv.total)]],
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [30, 64, 120] },
      footStyles: { fillColor: [239, 246, 255], textColor: 20, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right', cellWidth: 45 } },
      margin: { left: M, right: M },
    });

    // Riwayat pembayaran
    let afterY = doc.lastAutoTable.finalY + 6;
    doc.setFont(undefined, 'bold'); doc.setFontSize(9); doc.setTextColor(30);
    doc.text('Riwayat Pembayaran', M, afterY);
    autoTableFn(doc, {
      startY: afterY + 2,
      head: [['Tanggal', 'Keterangan', 'Jumlah']],
      body: inv.payments.length ? inv.payments.map((p) => [p.tglFmt, p.label, fmt(p.amount)]) : [['—', 'Belum ada pembayaran', fmt(0)]],
      styles: { fontSize: 8, cellPadding: 1.6 },
      headStyles: { fillColor: [100, 116, 139] },
      columnStyles: { 0: { cellWidth: 28 }, 2: { halign: 'right', cellWidth: 40 } },
      margin: { left: M, right: M },
    });

    // Ringkasan total/dibayar/sisa
    let sy = doc.lastAutoTable.finalY + 8;
    const line = (label, val, bold) => { doc.setFont(undefined, bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 11 : 9); doc.text(label, 110, sy); doc.text(fmt(val), R, sy, { align: 'right' }); sy += bold ? 7 : 6; };
    if (inv.milestone && inv.tagihanIni > 0) { doc.setTextColor(30, 64, 120); line(`Tagihan Invoice Ini (${inv.milestone})`, inv.tagihanIni, true); doc.setTextColor(30); }
    line('Total Tagihan Trip', inv.total);
    line('Sudah Dibayar', inv.dibayar);
    doc.setDrawColor(200); doc.line(120, sy - 3, R, sy - 3);
    doc.setTextColor(inv.sisa > 0 ? 190 : 20, inv.sisa > 0 ? 30 : 120, 40);
    line('SISA TAGIHAN', inv.sisa, true);
    doc.setTextColor(30);

    // Footer: rekening + catatan
    let fy = Math.max(sy + 6, 265);
    doc.setDrawColor(220); doc.line(M, fy - 4, R, fy - 4);
    doc.setFontSize(8); doc.setFont(undefined, 'normal');
    if (company.bankName || company.bankNo) {
      doc.text(`Pembayaran transfer ke: ${company.bankName || ''} ${company.bankNo || ''}${company.bankHolder ? ' a.n. ' + company.bankHolder : ''}`, M, fy);
      fy += 4;
    }
    if (company.footer) doc.text(doc.splitTextToSize(company.footer, R - M), M, fy);
  }

  async function invoiceZip() {
    if (busy) return;
    setBusy('invoice');
    try {
      const res = await buildTripInvoices(trip.id);
      if (res?.error) { alert('Gagal ambil data invoice: ' + res.error); return; }
      if (!res.invoices?.length) { alert('Tidak ada peserta untuk invoice.'); return; }
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (const inv of res.invoices) {
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        renderInvoice(doc, autoTable, res.company, res.trip, inv);
        const nm = `${String(inv.idx).padStart(2, '0')} - ${safeName((inv.milestone ? inv.milestone + ' - ' : '') + inv.peserta.nama, 'invoice')}`;
        zip.file(`${nm}.pdf`, doc.output('arraybuffer'));
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      download(blob, `invoice-peserta-${safeName(trip.kode, 'trip')}.zip`);
    } catch (e) { alert('Gagal membuat ZIP invoice: ' + (e?.message || e)); }
    finally { setBusy(''); }
  }

  async function vendorPdf() {
    if (!vendor.length || busy) return;
    setBusy('vendor');
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.text('REKAP HPP / INVOICE VENDOR', 14, 18);
      doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.text(`${trip.kode} · ${trip.name}`, 14, 25);
      doc.text(`Berangkat: ${trip.depFmt || '-'}`, 14, 31);
      const total = vendor.reduce((s, v) => s + (v.jumlah || 0), 0);
      autoTable(doc, {
        startY: 36,
        head: [['#', 'Kategori', 'Vendor', 'Status', 'Jumlah']],
        body: vendor.map((v, i) => [i + 1, v.kategori + (v.komponen ? ` · ${v.komponen}` : ''), v.vendor || '-', v.status || '-', fmt(v.jumlah)]),
        foot: [['', '', '', 'TOTAL HPP', fmt(total)]],
        styles: { fontSize: 9 }, headStyles: { fillColor: [71, 85, 105] }, footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 10 }, 4: { halign: 'right' } },
      });
      doc.save(`rekap-hpp-${safeName(trip.kode, 'trip')}.pdf`);
    } catch (e) { alert('Gagal membuat PDF rekap: ' + (e?.message || e)); }
    finally { setBusy(''); }
  }

  const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40';

  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={invoiceZip} disabled={!!busy} className={btn}>📄 {busy === 'invoice' ? 'Menyiapkan…' : 'Semua Invoice Pembayaran (ZIP)'}</button>
      <button onClick={vendorPdf} disabled={!!busy || !vendor.length} className={btn}>📑 {busy === 'vendor' ? 'Menyiapkan…' : 'Rekap HPP Vendor (PDF)'}</button>
      <a href={`/api/pembukuan/${encodeURIComponent(trip.id)}/bukti`} className={btn} title={buktiCount ? '' : 'Belum ada bukti bayar terupload'} aria-disabled={!buktiCount} onClick={(e) => { if (!buktiCount) e.preventDefault(); }}>🧾 Bukti Bayar Peserta (ZIP · {buktiCount})</a>
    </div>
  );
}
