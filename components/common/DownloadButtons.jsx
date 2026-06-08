'use client';

// R157 + R215: Universal Download Buttons
// R215 enhancements:
// - Excel auto-filter (panah ⏷ di tiap kolom header — bisa filter kayak di screenshot user)
// - Freeze header row (header tetap keliatan pas scroll)
// - Format Rupiah / number / percent otomatis di cell Excel (bukan string)
// - Column picker (centang kolom yg mau ditampilin sebelum download)
// - Backward compatible — semua prop existing tetap jalan
// Path: components/common/DownloadButtons.jsx

import { useState, useEffect, useRef } from 'react';

// ============ FORMAT HELPERS ============
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
  hidePicker = false,           // R215: kalau true, kolom picker disembunyiin
  pdfOrientation = 'landscape',
  extraInfo = [],
}) {
  const [loading, setLoading] = useState(null);

  // R215 — column picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set(columns.map((c) => c.key)));
  const pickerRef = useRef(null);

  // R215 — sync kalau columns prop berubah
  useEffect(() => {
    setSelectedKeys(new Set(columns.map((c) => c.key)));
  }, [columns.map((c) => c.key).join('|')]);

  // R215 — close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    function handler(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  // R215 — filter kolom sesuai picker
  const effectiveColumns = columns.filter((c) => selectedKeys.has(c.key));

  function toggleKey(key) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function selectAll() { setSelectedKeys(new Set(columns.map((c) => c.key))); }
  function clearAll()  { setSelectedKeys(new Set()); }

  function safeFormat(value, col) {
    return applyFormat(value, col.format);
  }

  // R215 — get number format string untuk Excel cell
  function excelNumberFormat(format) {
    switch (format) {
      case 'rupiah':  return '"Rp "#,##0';
      case 'number':  return '#,##0';
      case 'percent': return '0.0"%"';
      default:        return null;
    }
  }

  async function downloadExcel() {
    if (effectiveColumns.length === 0) {
      alert('Pilih minimal 1 kolom dulu di "⚙ Kolom"');
      return;
    }
    setLoading('excel');
    try {
      const XLSX = await import('xlsx');

      const aoa = [];
      aoa.push([title]);
      if (subtitle) aoa.push([subtitle]);
      extraInfo.forEach((info) => aoa.push([info.label, info.value]));
      aoa.push([]);

      // R215 — track header row position (0-indexed)
      const headerRowIdx = aoa.length;
      aoa.push(effectiveColumns.map((c) => c.label));

      const dataStartRowIdx = aoa.length;
      rows.forEach((row) => {
        aoa.push(effectiveColumns.map((col) => {
          const v = row[col.key];
          // Keep raw number untuk excel cells (biar bisa di-filter / formulaic / format Rupiah native)
          if ((col.format === 'rupiah' || col.format === 'number' || col.format === 'percent') && typeof v === 'number') {
            return v;
          }
          return safeFormat(v, col);
        }));
      });
      const dataEndRowIdx = aoa.length - 1;

      if (summary.length > 0) {
        aoa.push([]);
        summary.forEach((s) => aoa.push([s.label, s.value]));
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa);

      // R215 — auto column width
      const colWidths = effectiveColumns.map((col) => {
        const labelLen = String(col.label || '').length;
        const maxDataLen = rows.length === 0
          ? labelLen
          : Math.max(...rows.map((row) => {
              const v = row[col.key];
              const formatted = (col.format === 'rupiah' || col.format === 'number' || col.format === 'percent') && typeof v === 'number'
                ? applyFormat(v, col.format)
                : safeFormat(v, col);
              return String(formatted || '').length;
            }));
        return { wch: Math.min(Math.max(labelLen, maxDataLen) + 2, 50) };
      });
      ws['!cols'] = colWidths;

      // R215 — apply number format ke currency / number / percent cells (so Excel display "Rp 1,000,000" native)
      if (dataEndRowIdx >= dataStartRowIdx) {
        effectiveColumns.forEach((col, colIdx) => {
          const numFmt = excelNumberFormat(col.format);
          if (!numFmt) return;
          for (let r = dataStartRowIdx; r <= dataEndRowIdx; r++) {
            const cellRef = XLSX.utils.encode_cell({ r, c: colIdx });
            const cell = ws[cellRef];
            if (cell && typeof cell.v === 'number') {
              cell.z = numFmt;
              cell.t = 'n';
            }
          }
        });
      }

      // R215 — AUTO-FILTER pada header row + data range (panah ⏷ di tiap kolom Excel)
      if (dataEndRowIdx >= headerRowIdx && effectiveColumns.length > 0) {
        const lastColLetter = XLSX.utils.encode_col(effectiveColumns.length - 1);
        const headerRowExcel = headerRowIdx + 1;     // 1-indexed Excel row
        const dataEndRowExcel = dataEndRowIdx + 1;
        ws['!autofilter'] = {
          ref: `A${headerRowExcel}:${lastColLetter}${dataEndRowExcel}`,
        };

        // R215 — FREEZE header row (top rows tetap keliatan pas scroll)
        ws['!views'] = [{
          state: 'frozen',
          xSplit: 0,
          ySplit: headerRowExcel,
          topLeftCell: `A${headerRowExcel + 1}`,
          activePane: 'bottomLeft',
        }];
      }

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
    if (effectiveColumns.length === 0) {
      alert('Pilih minimal 1 kolom dulu di "⚙ Kolom"');
      return;
    }
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
        head: [effectiveColumns.map((c) => c.label)],
        body: rows.map((row) => effectiveColumns.map((col) => safeFormat(row[col.key], col))),
        startY: y,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: effectiveColumns.reduce((acc, col, i) => {
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
    if (effectiveColumns.length === 0) {
      alert('Pilih minimal 1 kolom dulu di "⚙ Kolom"');
      return;
    }
    setLoading('csv');
    try {
      const lines = [];
      lines.push([title].map(csvEscape).join(','));
      if (subtitle) lines.push([subtitle].map(csvEscape).join(','));
      extraInfo.forEach((info) => lines.push([info.label, info.value].map(csvEscape).join(',')));
      lines.push('');
      lines.push(effectiveColumns.map((c) => csvEscape(c.label)).join(','));
      rows.forEach((row) => {
        lines.push(effectiveColumns.map((col) => csvEscape(safeFormat(row[col.key], col))).join(','));
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

  const selectedCount = selectedKeys.size;
  const totalCount = columns.length;
  const allSelected = selectedCount === totalCount;
  const someSelected = selectedCount > 0 && !allSelected;

  return (
    <div className="inline-flex items-center gap-1.5 relative">
      {!hidePDF && (
        <button
          type="button"
          onClick={downloadPDF}
          disabled={loading != null || rows.length === 0 || effectiveColumns.length === 0}
          className={`${sizeCls} bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded inline-flex items-center gap-1 transition-colors`}
          title={`Download ${rows.length} baris × ${effectiveColumns.length} kolom sebagai PDF`}
        >
          {loading === 'pdf' ? '⏳' : '📄'} PDF
        </button>
      )}
      {!hideExcel && (
        <button
          type="button"
          onClick={downloadExcel}
          disabled={loading != null || rows.length === 0 || effectiveColumns.length === 0}
          className={`${sizeCls} bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded inline-flex items-center gap-1 transition-colors`}
          title={`Download ${rows.length} baris × ${effectiveColumns.length} kolom sebagai Excel (with auto-filter)`}
        >
          {loading === 'excel' ? '⏳' : '📊'} Excel
        </button>
      )}
      {!hideCSV && (
        <button
          type="button"
          onClick={downloadCSV}
          disabled={loading != null || rows.length === 0 || effectiveColumns.length === 0}
          className={`${sizeCls} bg-slate-500 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded inline-flex items-center gap-1 transition-colors`}
          title={`Download ${rows.length} baris × ${effectiveColumns.length} kolom sebagai CSV`}
        >
          {loading === 'csv' ? '⏳' : '📋'} CSV
        </button>
      )}

      {/* R215 — Column picker button */}
      {!hidePicker && columns.length > 0 && (
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className={`${sizeCls} ${someSelected ? 'bg-amber-500 hover:bg-amber-600' : 'bg-brand-500 hover:bg-brand-600'} text-white font-semibold rounded inline-flex items-center gap-1 transition-colors`}
            title="Pilih kolom yang mau ditampilin di download"
          >
            ⚙ Kolom ({selectedCount}/{totalCount})
          </button>
          {pickerOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-white border-2 border-brand-300 rounded-lg shadow-xl p-3 min-w-[220px] max-h-[400px] overflow-auto">
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-200">
                <p className="text-xs font-bold text-brand-700 uppercase tracking-wider">Pilih Kolom</p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-[10px] font-semibold px-2 py-0.5 bg-green-100 hover:bg-green-200 text-green-700 rounded"
                  >
                    ✓ Semua
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded"
                  >
                    ✕ Kosong
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                {columns.map((col) => {
                  const checked = selectedKeys.has(col.key);
                  return (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer"
                    >
                      <input autoComplete="off"
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleKey(col.key)}
                        className="w-3.5 h-3.5 accent-brand-500"
                      />
                      <span className="text-xs text-slate-700">{col.label}</span>
                    </label>
                  );
                })}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between">
                <p className="text-[10px] text-slate-500">{selectedCount} dari {totalCount} kolom dipilih</p>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="text-[10px] font-semibold px-2 py-0.5 bg-brand-500 hover:bg-brand-600 text-white rounded"
                >
                  Tutup
                </button>
              </div>
            </div>
          )}
        </div>
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
