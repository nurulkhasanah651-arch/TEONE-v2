'use client';

// Tombol download dokumen pembukuan per trip:
//  - Invoice Peserta (ZIP PDF)   : 1 PDF invoice per peserta, di-ZIP (jsPDF + JSZip, client-side)
//  - Rekap HPP Vendor (PDF)      : 1 PDF tabel biaya vendor (jsPDF + autotable)
//  - Bukti Bayar Peserta (ZIP)   : file bukti dari Google Drive → server route
import { useState } from 'react';

const fmt = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
const safeName = (s, fb) => (String(s || fb || '').replace(/[^\w\- ]+/g, '').trim() || fb).slice(0, 45);

export default function BookkeepingDownloads({ trip, peserta = [], vendor = [], buktiCount = 0 }) {
  const [busy, setBusy] = useState('');

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
  }

  async function invoiceZip() {
    if (!peserta.length || busy) return;
    setBusy('invoice');
    try {
      const { jsPDF } = await import('jspdf');
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      let i = 0;
      for (const p of peserta) {
        i += 1;
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.text('INVOICE PESERTA', 14, 20);
        doc.setFontSize(10); doc.setFont(undefined, 'normal');
        doc.text(`${trip.kode} · ${trip.name}`, 14, 28);
        doc.text(`Berangkat: ${trip.depFmt || '-'}`, 14, 34);
        doc.setDrawColor(200); doc.line(14, 38, 196, 38);
        doc.setFont(undefined, 'bold'); doc.text(`Peserta: ${p.nama}`, 14, 46);
        doc.setFont(undefined, 'normal'); doc.text(`Kamar: ${p.room || '-'}`, 14, 52);
        const sisa = Math.max((p.nilai || 0) - (p.dibayar || 0), 0);
        let y = 64;
        const row = (label, val, bold) => { doc.setFont(undefined, bold ? 'bold' : 'normal'); doc.text(label, 14, y); doc.text(fmt(val), 196, y, { align: 'right' }); y += 8; };
        row('Nilai Jual (Tagihan)', p.nilai);
        row('Sudah Dibayar', p.dibayar);
        doc.setDrawColor(200); doc.line(14, y - 4, 196, y - 4);
        row('Sisa Tagihan', sisa, true);
        doc.setFontSize(8); doc.setTextColor(150);
        doc.text('Dokumen dibuat otomatis dari sistem TEONE untuk keperluan pembukuan.', 14, 285);
        zip.file(`${String(i).padStart(2, '0')} - ${safeName(p.nama, 'pax-' + p.id)}.pdf`, doc.output('arraybuffer'));
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
      await import('jspdf-autotable');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.text('REKAP HPP / INVOICE VENDOR', 14, 18);
      doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.text(`${trip.kode} · ${trip.name}`, 14, 25);
      doc.text(`Berangkat: ${trip.depFmt || '-'}`, 14, 31);
      const total = vendor.reduce((s, v) => s + (v.jumlah || 0), 0);
      doc.autoTable({
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
      <button onClick={invoiceZip} disabled={busy || !peserta.length} className={btn}>📄 {busy === 'invoice' ? 'Menyiapkan…' : `Invoice Peserta (ZIP · ${peserta.length})`}</button>
      <button onClick={vendorPdf} disabled={busy || !vendor.length} className={btn}>📑 {busy === 'vendor' ? 'Menyiapkan…' : 'Rekap HPP Vendor (PDF)'}</button>
      <a href={`/api/pembukuan/${encodeURIComponent(trip.id)}/bukti`} className={btn} title={buktiCount ? '' : 'Belum ada bukti bayar terupload'} aria-disabled={!buktiCount} onClick={(e) => { if (!buktiCount) e.preventDefault(); }}>🧾 Bukti Bayar Peserta (ZIP{buktiCount ? ` · ${buktiCount}` : ' · 0'})</a>
    </div>
  );
}
