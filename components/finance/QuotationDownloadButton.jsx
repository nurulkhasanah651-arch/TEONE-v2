'use client';

// R215c: Quotation per Group Excel download
// Format kayak Google Sheet "PRO DMC X TBA" — header info + table Income/Expense
// CLIENT component — pakai SheetJS untuk generate Excel
// Path: components/finance/QuotationDownloadButton.jsx

import { useState } from 'react';

export default function QuotationDownloadButton({
  trip,
  incomeItems = [],
  hppItems = [],
  paxCount = 0,
  totalIncome = 0,
  totalHPP = 0,
  profit = 0,
  operatedBy = 'PRO DMC',
}) {
  const [loading, setLoading] = useState(false);

  function fmtRp(n) {
    return `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
  }

  function fmtDateID(d) {
    if (!d) return '';
    try {
      return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' });
    } catch { return String(d); }
  }

  function fmtPeriode(trip) {
    const dep = trip.departure;
    const ret = trip.return_date || trip.end_date || trip.return || null;
    if (!dep) return '-';
    const start = new Date(dep).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
    if (ret) {
      const end = new Date(ret).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
      return `${start} – ${end}`;
    }
    return new Date(dep).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  async function downloadQuotation() {
    setLoading(true);
    try {
      const XLSX = await import('xlsx');

      const kurs = trip.kurs ?? 17000;
      const tripKode = trip.kode_trip || `#${trip.id}`;
      const tripName = trip.name || '-';
      const periode = fmtPeriode(trip);
      const today = fmtDateID(new Date());

      // R215c — TL count default 1, bisa di-override dari trip kalau ada
      const tlCount = trip.tl_count || 1;
      const titleTLLabel = `QUOTATION ${paxCount} + ${tlCount} TL`;
      const subtitleLabel = `${(operatedBy || 'PRO DMC').toUpperCase()} X TBA`;

      const aoa = [];

      // ROW 0: Title
      aoa.push([titleTLLabel]);
      // ROW 1: Subtitle
      aoa.push([subtitleLabel]);
      // ROW 2: empty
      aoa.push([]);
      // ROW 3-7: Info rows (kanan)
      aoa.push(['', '', '', '', '', '', '', 'Rate Kurs', kurs, today]);
      aoa.push(['', '', '', '', '', '', '', 'Trip Code', tripKode, '']);
      aoa.push(['', '', '', '', '', '', '', 'Package', tripName, '']);
      aoa.push(['', '', '', '', '', '', '', 'Periode', periode, '']);
      aoa.push(['', '', '', '', '', '', '', 'Total Margin', profit, '']);
      // ROW 8: empty
      aoa.push([]);
      // ROW 9: Table header
      const headerRowIdx = aoa.length;
      aoa.push([
        'No', 'Category', 'Component', 'Basic Fare',
        'Total Pax on Reservation', 'Total Pax to Vendor',
        'Income', 'Expense', 'Status Payment', 'Noted',
      ]);

      // DATA START
      const dataStartIdx = aoa.length;
      let rowNo = 0;

      // ====== SELLING PRICES (Income items) ======
      let isFirstIncome = true;
      for (const item of incomeItems) {
        rowNo++;
        const paxOnRes = item.pax_override ?? item.qty ?? paxCount;
        aoa.push([
          rowNo,
          isFirstIncome ? 'Selling Prices' : '',
          item.component || '-',
          Number(item.basic_fare) || 0,
          paxOnRes,
          '',
          Number(item.total_amount) || 0,
          '',
          item.payment_status === 'lunas' ? '✅' : '☐',
          item.notes || '',
        ]);
        isFirstIncome = false;
      }

      // ====== HPP (grouped by category) ======
      const hppByCategory = {};
      for (const item of hppItems) {
        const k = item.category || 'Lainnya';
        if (!hppByCategory[k]) hppByCategory[k] = [];
        hppByCategory[k].push(item);
      }

      for (const [category, list] of Object.entries(hppByCategory)) {
        let isFirstInCat = true;
        for (const item of list) {
          rowNo++;
          const paxToVendor = item.pax_override ?? item.qty ?? paxCount;
          // Currency display di Basic Fare — kalau ada item.currency='USD', tampilin "$xxx", else angka Rp
          const basicFareDisplay = item.currency === 'USD'
            ? `$${Number(item.basic_fare || 0).toLocaleString('en-US')}`
            : (Number(item.basic_fare) || 0);
          aoa.push([
            rowNo,
            isFirstInCat ? category : '',
            item.component || '-',
            basicFareDisplay,
            '',
            paxToVendor,
            '',
            Number(item.total_amount) || 0,
            item.payment_status === 'lunas' ? '✅' : '☐',
            item.notes || '',
          ]);
          isFirstInCat = false;
        }
      }

      const dataEndIdx = aoa.length - 1;

      // ROW: empty
      aoa.push([]);

      // ROW: TOTAL
      const marginPerPax = paxCount > 0 ? Math.round(profit / paxCount) : 0;
      const marginPct = totalIncome > 0 ? (profit / totalIncome) * 100 : 0;
      const totalRowIdx = aoa.length;
      aoa.push(['', '', '', 'TOTAL', '', '', totalIncome, totalHPP, 'Margin per pax', marginPerPax]);
      aoa.push(['', '', '', '', '', '', '', '', 'Margin %', `${marginPct.toFixed(2)}%`]);

      const ws = XLSX.utils.aoa_to_sheet(aoa);

      // Column widths
      ws['!cols'] = [
        { wch: 4 },   // No
        { wch: 22 },  // Category
        { wch: 22 },  // Component
        { wch: 16 },  // Basic Fare
        { wch: 14 },  // Pax Reservation
        { wch: 14 },  // Pax Vendor
        { wch: 18 },  // Income
        { wch: 18 },  // Expense
        { wch: 14 },  // Status
        { wch: 18 },  // Noted
      ];

      // Currency format pada cell numerik
      const currencyColIdxs = [3, 6, 7]; // Basic Fare, Income, Expense
      for (const colIdx of currencyColIdxs) {
        for (let r = dataStartIdx; r <= dataEndIdx; r++) {
          const cellRef = XLSX.utils.encode_cell({ r, c: colIdx });
          if (ws[cellRef] && typeof ws[cellRef].v === 'number') {
            ws[cellRef].z = '"Rp "#,##0';
            ws[cellRef].t = 'n';
          }
        }
      }

      // TOTAL row currency format
      for (const colIdx of [6, 7, 9]) {
        const cellRef = XLSX.utils.encode_cell({ r: totalRowIdx, c: colIdx });
        if (ws[cellRef] && typeof ws[cellRef].v === 'number') {
          ws[cellRef].z = '"Rp "#,##0';
          ws[cellRef].t = 'n';
        }
      }

      // Total Margin row (row 7, col 8 = I8) format Rp
      const totalMarginRef = XLSX.utils.encode_cell({ r: 7, c: 8 });
      if (ws[totalMarginRef] && typeof ws[totalMarginRef].v === 'number') {
        ws[totalMarginRef].z = '"Rp "#,##0';
        ws[totalMarginRef].t = 'n';
      }

      // Rate Kurs row 3 col 8 — format number with thousand sep
      const kursRef = XLSX.utils.encode_cell({ r: 3, c: 8 });
      if (ws[kursRef] && typeof ws[kursRef].v === 'number') {
        ws[kursRef].z = '#,##0';
        ws[kursRef].t = 'n';
      }

      // Auto-filter pada table header + data
      if (rowNo > 0) {
        ws['!autofilter'] = {
          ref: `A${headerRowIdx + 1}:J${dataEndIdx + 1}`,
        };
      }

      // Freeze top rows (sampai table header)
      ws['!views'] = [{
        state: 'frozen',
        xSplit: 0,
        ySplit: headerRowIdx + 1,
        topLeftCell: `A${headerRowIdx + 2}`,
        activePane: 'bottomLeft',
      }];

      // Merge title rows (kalau xlsx mendukung)
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }, // title row span 10 cols
        { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } }, // subtitle row span 10 cols
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Quotation');
      XLSX.writeFile(wb, `quotation-${tripKode}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      alert('Gagal generate quotation: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={downloadQuotation}
      disabled={loading}
      className="px-3 py-2 text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold rounded inline-flex items-center gap-1 transition-colors"
      title="Download Quotation Excel format PRO DMC (Selling Prices + HPP + Total Margin per pax)"
    >
      {loading ? '⏳ Generating...' : '📋 Quotation Excel'}
    </button>
  );
}
