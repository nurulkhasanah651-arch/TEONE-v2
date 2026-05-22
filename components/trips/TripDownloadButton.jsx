'use client';

// Round 77: Tombol download "Per Trip Lengkap" di trip detail page
// Download CSV multi-section: Info Trip, Peserta, Finance Items, Payment Status

import { useState } from 'react';

function fmtRupiah(n) {
  const v = Number(n) || 0;
  return 'Rp ' + v.toLocaleString('id-ID');
}

function downloadCSV(filename, sections) {
  // sections = [{ title, rows }]
  const lines = [];
  for (const sec of sections) {
    lines.push(`=== ${sec.title} ===`);
    for (const row of sec.rows) {
      lines.push(row.map((c) => {
        const s = String(c ?? '');
        if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      }).join(','));
    }
    lines.push('');
  }
  const csv = lines.join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TripDownloadButton({ trip, participants = [], financeItems = [] }) {
  const [pending, setPending] = useState(false);

  function handleDownload() {
    setPending(true);
    try {
      const sections = [];

      // === Section 1: Info Trip ===
      const breakdown = trip.price_breakdown || {};
      sections.push({
        title: 'INFO TRIP',
        rows: [
          ['Field', 'Value'],
          ['Kode Trip', trip.kode_trip || `#${trip.id}`],
          ['Nama', trip.name || ''],
          ['Destinasi', trip.destination || ''],
          ['Tipe Tiket', trip.ticket || ''],
          ['Status', trip.status || ''],
          ['Departure', trip.departure || ''],
          ['Arrival', trip.arrival || ''],
          ['Deadline Booking', trip.deadline_close || ''],
          ['Publish Date', trip.publish_date || ''],
          ['Closed At', trip.closed_at || ''],
          ['Quota', trip.quota || 0],
          ['Sold', trip.sold || 0],
          ['Seat Left', trip.seat_left || 0],
          ['Peserta Total', participants.length],
          ['PIC (CS)', trip.pic || ''],
          ['Tour Leader', trip.tl_name || ''],
          ['PNR', trip.pnr || ''],
          ['Route', trip.route || ''],
          ['Status Tiket', trip.ticket_status || ''],
          ['Status Visa', trip.visa || ''],
          ['Manifest', trip.manifest || ''],
          ['Room List', trip.roomlist || ''],
          ['Status Payment', trip.payment || ''],
          ['Briefing TL', trip.briefing_tl || ''],
          ['Notes', trip.notes || ''],
        ],
      });

      // === Section 2: Harga per Tipe (Breakdown) ===
      const breakdownRows = [['Tipe', 'Harga']];
      const standardKeys = ['dbl', 'twn', 'tpl', 'single', 'child_extra_bed', 'child_no_bed', 'infant', 'visa', 'asuransi', 'customs', 'departure_tax'];
      for (const k of standardKeys) {
        if (breakdown[k] != null && breakdown[k] !== 0) {
          breakdownRows.push([k, breakdown[k]]);
        }
      }
      if (Array.isArray(breakdown._custom)) {
        for (const c of breakdown._custom) {
          breakdownRows.push([c.name || 'custom', c.price || 0]);
        }
      }
      sections.push({
        title: 'HARGA PER TIPE',
        rows: breakdownRows,
      });

      // === Section 3: Peserta ===
      if (participants.length > 0) {
        const paxRows = [['No', 'Nama', 'Email', 'Phone', 'Room Type', 'Age Type', 'Visa Status', 'Notes']];
        participants.forEach((p, i) => {
          const c = p.customers || {};
          paxRows.push([
            i + 1,
            c.name || p.name || '',
            c.email || '',
            c.phone || '',
            p.room_type || '',
            p.age_type || 'adult',
            p.visa_status || '',
            p.notes || '',
          ]);
        });
        sections.push({ title: `PESERTA (${participants.length})`, rows: paxRows });
      }

      // === Section 4: Finance Items (HPP + Cash In) ===
      if (financeItems.length > 0) {
        const finRows = [['Type', 'Kategori', 'Description', 'Vendor', 'Amount', 'Status', 'Date']];
        let totalHpp = 0;
        let totalCashIn = 0;
        for (const f of financeItems) {
          const amt = Number(f.amount) || 0;
          if (f.type === 'cash_in') totalCashIn += amt;
          else totalHpp += amt;
          finRows.push([
            f.type || '',
            f.category || '',
            f.description || '',
            f.vendor || '',
            amt,
            f.status || '',
            f.date || f.created_at || '',
          ]);
        }
        finRows.push(['', '', '', 'TOTAL HPP', totalHpp, '', '']);
        finRows.push(['', '', '', 'TOTAL CASH IN', totalCashIn, '', '']);
        finRows.push(['', '', '', 'MARGIN', totalCashIn - totalHpp, '', '']);
        sections.push({ title: `FINANCE (${financeItems.length} items)`, rows: finRows });
      }

      const safeName = (trip.kode_trip || `trip_${trip.id}`).replace(/[^a-zA-Z0-9_-]/g, '_');
      downloadCSV(`${safeName}_lengkap.csv`, sections);
    } catch (e) {
      alert('Download error: ' + (e?.message || 'unknown'));
    }
    setPending(false);
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={pending}
      className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-card transition-colors flex items-center gap-2"
    >
      <span>⬇</span> Download Excel ({trip.kode_trip || `#${trip.id}`})
    </button>
  );
}
