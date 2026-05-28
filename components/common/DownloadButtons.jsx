'use client';

// Round 154: Universal Download Buttons component
// Generate PDF, Excel, CSV dari data apapun
// Path: components/common/DownloadButtons.jsx
//
// Usage:
//   <DownloadButtons
//     filename="invoice-peserta-eropa-sept"
//     title="Invoice Peserta — Eropa Sept 2026"
//     subtitle="Generated 28 Mei 2026"
//     columns={[
//       { key: 'nama', label: 'Nama Peserta' },
//       { key: 'amount', label: 'Tagihan', format: (v) => `Rp ${Number(v).toLocaleString('id-ID')}`, align: 'right' },
//     ]}
//     rows={data}
//     summary={[{ label: 'TOTAL', value: 'Rp 250.000.000' }]}  // opsional
//   />

import { useState } from 'react';

export default function DownloadButtons({
  filename = 'export',
  title = 'Data Export',
  subtitle = '',
  columns = [],
  rows = [],
  summary = [],
  buttonSize = 'sm', // 'sm' | 'md'
  hidePDF = false,
  hideExcel = false,
  hideCSV = false,
  pdfOrientation = 'landscape', // 'portrait' | 'landscape'
  extraInfo = [], // array of { label, value } untuk di-print di header
}) {
  const [loading, setLoading] = useState(null); // 'pdf' | 'excel' | 'csv' | null

  function safeFormat(value, col) {
    if (value == null) return '';
    if (col.format) {
      try { return col.format(value); } catch { return String(value); }
    }
    return String(value);
  }

  async function downloadExcel() {
    setLoading('excel');
    try {
      const XLSX = await import('xlsx');

      // Build header rows: title + subtitle + extraInfo
      const aoa = [];
      aoa.push([title]);
      if (subtitle) aoa.push([subtitle]);
      extraInfo.forEach((info) => aoa.push([info.label, info.value]));
      aoa.push([]); // blank row

      // Columns header
      aoa.push(columns.map((c) => c.label));

      // Data rows
      rows.forEach((row) => {
        aoa.push(columns.map((col) => {
          const v = row[col.key];
          // for excel, keep numbers as numbers when format is for currency
          if (col.numeric && typeof v === 'number') return v;
          return safeFormat(v, col);
        }));
      });

      // Summary
      if (summary.length > 0) {
        aoa.push([]);
        summary.forEach((s) => aoa.push([s.label, s.value]));
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa);

      // Auto-width columns
      const colWidths = columns.map((col) => {
        const maxLen = Math.max(
          col.label.length,
          ...rows.map((row) => String(safeFormat(row[col.key], col) || '').length)
        );
        return { wch: Math.min(maxLen + 2, 50) };
      });
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Data');
      XLSX.writeFile(wb, `${filename}.xlsx`);
    } catch (e) {
      alert('Gagal generate Excel: ' + e.message);
    } finally {
      setLoading(null);
    }
  }

  async function downloadPDF() {
    setLoading('pdf');
    try {
      const jsPDFModule = await import('jspdf');
      await import('jspdf-autotable');
      const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;

      const doc = new jsPDF({ orientation: pdfOrientation, unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(title, 14, 15);

      let y = 22;
      if (subtitle) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80);
        doc.text(subtitle, 14, y);
        y += 6;
      }

      // Extra info (key-value)
      if (extraInfo.length > 0) {
        doc.setFontSize(9);
        doc.setTextColor(60);
        extraInfo.forEach((info) => {
          doc.text(`${info.label}: ${info.value}`, 14, y);
          y += 5;
        });
      }
      y += 2;

      // Table
      doc.autoTable({
        head: [columns.map((c) => c.label)],
        body: rows.map((row) => columns.map((col) => safeFormat(row[col.key], col))),
        startY: y,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: columns.reduce((acc, col, i) => {
          if (col.align === 'right') acc[i] = { halign: 'right' };
          if (col.align === 'center') acc[i] = { halign: 'center' };
          return acc;
        }, {}),
        margin: { left: 14, right: 14 },
      });

      // Summary footer
      if (summary.length > 0) {
        const finalY = doc.lastAutoTable.finalY + 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0);
        summary.forEach((s, i) => {
          doc.text(`${s.label}: ${s.value}`, 14, finalY + i * 6);
        });
      }

      // Footer with timestamp
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(
          `TEONE · ${new Date().toLocaleString('id-ID')} · Page ${i}/${totalPages}`,
          14,
          doc.internal.pageSize.getHeight() - 8
        );
      }

      doc.save(`${filename}.pdf`);
    } catch (e) {
      alert('Gagal generate PDF: ' + e.message);
    } finally {
      setLoading(null);
    }
  }

  function downloadCSV() {
    setLoading('csv');
    try {
      const lines = [];
      lines.push([title].map(csvEscape).join(','));
      if (subtitle) lines.push([subtitle].map(csvEscape).join(','));
      extraInfo.forEach((info) => lines.push([info.label, info.value].map(csvEscape).join(',')));
      lines.push('');
      lines.push(columns.map((c) => csvEscape(c.label)).join(','));
      rows.forEach((row) => {
        lines.push(columns.map((col) => csvEscape(safeFormat(row[col.key], col))).join(','));
      });
      if (summary.length > 0) {
        lines.push('');
        summary.forEach((s) => lines.push([s.label, s.value].map(csvEscape).join(',')));
      }

      // BOM untuk excel buka CSV dengan benar di Windows
      const csv = '﻿' + lines.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Gagal generate CSV: ' + e.message);
    } finally {
      setLoading(null);
    }
  }

  const sizeCls = buttonSize === 'md'
    ? 'px-3 py-2 text-sm'
    : 'px-2.5 py-1.5 text-xs';

  return (
    <div className="inline-flex items-center gap-1.5">
      {!hidePDF && (
        <button
          type="button"
          onClick={downloadPDF}
          disabled={loading != null || rows.length === 0}
          className={`${sizeCls} bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded inline-flex items-center gap-1 transition-colors`}
          title={`Download ${rows.length} baris sebagai PDF`}
        >
          {loading === 'pdf' ? '⏳' : '📄'} PDF
        </button>
      )}
      {!hideExcel && (
        <button
          type="button"
          onClick={downloadExcel}
          disabled={loading != null || rows.length === 0}
          className={`${sizeCls} bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded inline-flex items-center gap-1 transition-colors`}
          title={`Download ${rows.length} baris sebagai Excel`}
        >
          {loading === 'excel' ? '⏳' : '📊'} Excel
        </button>
      )}
      {!hideCSV && (
        <button
          type="button"
          onClick={downloadCSV}
          disabled={loading != null || rows.length === 0}
          className={`${sizeCls} bg-slate-500 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded inline-flex items-center gap-1 transition-colors`}
          title={`Download ${rows.length} baris sebagai CSV`}
        >
          {loading === 'csv' ? '⏳' : '📋'} CSV
        </button>
      )}
    </div>
  );
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
