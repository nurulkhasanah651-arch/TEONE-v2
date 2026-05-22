// CSV export helper — UTF-8 BOM (Excel-compatible), defensive

import { NextResponse } from 'next/server';

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

/**
 * Generate CSV string from rows + headers
 * headers: array of { key, label, format?: (val, row) => string }
 */
export function buildCsv(rows, headers) {
  const headerLine = headers.map((h) => csvEscape(h.label || h.key)).join(',');
  const dataLines = rows.map((row) =>
    headers.map((h) => {
      const raw = row?.[h.key];
      const formatted = typeof h.format === 'function' ? h.format(raw, row) : raw;
      return csvEscape(formatted);
    }).join(',')
  );
  return '﻿' + [headerLine, ...dataLines].join('\r\n');
}

export function csvResponse(csv, filename) {
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Filter rows by month — checks given dateKey field
 * month: 'YYYY-MM' or 'all'
 */
export function filterByMonth(rows, dateKey, month) {
  if (!month || month === 'all') return rows;
  return rows.filter((r) => r?.[dateKey]?.startsWith?.(month));
}

/**
 * Build filename with month suffix
 */
export function buildFilename(prefix, month) {
  const suffix = month && month !== 'all' ? `_${month}` : '_alltime';
  return `${prefix}${suffix}_${new Date().toISOString().slice(0, 10)}.csv`;
}
