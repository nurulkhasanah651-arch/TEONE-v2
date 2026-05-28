'use client';

// Round 157 HOTFIX: Universal Download Buttons
// FIX: format jadi STRING TYPE (bukan function) supaya bisa di-pass dari Server Component
// Path: components/common/DownloadButtons.jsx
//
// Usage:
//   <DownloadButtons
//     filename="invoice-peserta"
//     title="Invoice Peserta"
//     columns={[
//       { key: 'nama', label: 'Nama' },
//       { key: 'amount', label: 'Tagihan', format: 'rupiah', align: 'right' },
//       { key: 'date', label: 'Tanggal', format: 'date' },
//     ]}
//     rows={data}
//   />

import { useState } from 'react';

// ============ FORMAT HELPERS (inside client component, safe to use as functions) ============
function fmtRupiah(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return `Rp ${n.toLocaleString('id-ID')}`;
}

function fmtNumber(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return n.toLocaleString('id-ID');
}

function fmtDate(v) {
  if (!v) return '';
  try {
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return String(v); }
}

function fmtDateTime(v) {
  if (!v) return '';
  try {
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return d.toLocaleString('id-ID');
  } catch { return String(v); }
}

function fmtPercent(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return `${n.toFixed(1)}%`;
}

// ============ MAIN FORMATTER ============
function applyFormat(value, formatType) {
  if (value == null) return '';
  if (!formatType) return String(value);

  switch (formatType) {
    case 'rupiah':   return fmtRupiah(value);
    case 'number':   return fmtNumber(value);
    case 'date':     return fmtDate(value);
    case 'datetime': return fmtDateTime(value);
    case 'percent':  return fmtPercent(value);
    default:         return String(value);
  }
}

export default function DownloadButtons({
  filename = 'export',
  title = 'Data Export',
  subtitle = '',
  columns = [],
  rows = [],
  summary = [],
  buttonSize = 'sm',
  hidePDF = false,
  hideExcel = false,
  hideCSV = false,
  pdfOrientation = 'landscape',
  extraInfo = [],
}) {
  const [loading, setLoading] = useState(null);

  function safeFormat(value, col) {
    return applyFormat(value, col.format);
  }

  async function downloadExcel() {
    setLoading('excel');
    try {
      const XLSX = await import('xlsx');

      const aoa = [];
      aoa.push([title]);
      if (subtitle) aoa.push([subtitle]);
      extraInfo.forEach((info) => aoa.push([info.label, info.value]));
      aoa.push([]);

      aoa.push(columns.map((c) => c.label));

      rows.forEach((row) => {
        aoa.push(columns.map((col) => {
          const v = row[col.key];
          // Keep raw number for excel cells (so it's filterable/formulaic)
          if ((col.format === 'rupiah' || col.format === 'number' || col.format === 'percent') && typeof v === 'number') {
            return v;
          }
          return safeFormat(v, col);
        }));
      });

      if (summary.length > 0) {
        aoa.push([]);
        summary.forEach((s) => aoa.push([s.label, s.value]));
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa);

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

      if (extraInfo.length > 0) {
        doc.setFontSize(9);
        doc.setTextColor(60);
        extraInfo.forEach((info) => {
          doc.text(`${info.label}: ${info.value}`, 14, y);
          y += 5;
        });
      }
      y += 2;

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

      if (summary.length > 0) {
        const finalY = doc.lastAutoTable.finalY + 8;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0);
        summary.forEach((s, i) => {
          doc.text(`${s.label}: ${s.value}`, 14, finalY + i * 6);
        });
      }

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
