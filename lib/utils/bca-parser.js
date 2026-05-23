// Round 92: BCA Mutasi CSV Parser
// Support 2 format BCA:
// 1. myBCA / KlikBCA Bisnis download (formatted)
// 2. KlikBCA Individu export (tabular)

// BCA CSV format umum:
// Tanggal,Cabang Transaksi,Keterangan,Mutasi,Saldo
// 02/05/2026,KCU/123,TRANSFER FROM ANDI SANTOSO,30000000.00 CR,30000000.00
// 03/05/2026,KCU/124,TRANSFER TO HOTEL ROMA,10000000.00 DB,20000000.00

// Parser: terima string CSV, return array { tanggal, keterangan, amount, type, saldo, reference }

export function parseBcaCSV(csvText) {
  if (!csvText || typeof csvText !== 'string') return { ok: false, error: 'Empty CSV', rows: [] };

  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { ok: false, error: 'CSV harus minimal punya header + 1 baris data', rows: [] };

  // Detect delimiter (comma atau semicolon)
  const sample = lines[0];
  const delim = sample.includes(';') && !sample.includes(',') ? ';' : ',';

  // Parse header
  const headers = lines[0].split(delim).map((h) => h.trim().toLowerCase().replace(/"/g, ''));

  // Find column indices (flexible — BCA punya banyak variasi naming)
  const idxTanggal = findIdx(headers, ['tanggal', 'tgl', 'date']);
  const idxKeterangan = findIdx(headers, ['keterangan', 'description', 'note', 'transaksi']);
  const idxMutasi = findIdx(headers, ['mutasi', 'jumlah', 'amount']);
  const idxSaldo = findIdx(headers, ['saldo', 'balance']);
  const idxRef = findIdx(headers, ['reference', 'ref', 'no. ref', 'transaction id']);
  // Optional: separate CR/DB column
  const idxType = findIdx(headers, ['type', 'jenis', 'd/k', 'db/cr', 'mutasi type']);
  const idxDebit = findIdx(headers, ['debit', 'db', 'pengeluaran']);
  const idxKredit = findIdx(headers, ['kredit', 'cr', 'pemasukan']);

  if (idxTanggal < 0) {
    return { ok: false, error: 'Kolom Tanggal tidak ketemu. Header: ' + headers.join(' / '), rows: [] };
  }

  const rows = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseRow(lines[i], delim);
    try {
      const tanggalStr = (cols[idxTanggal] || '').trim();
      if (!tanggalStr) continue;

      const tanggal = parseDateID(tanggalStr);
      if (!tanggal) {
        errors.push(`Row ${i}: tanggal "${tanggalStr}" tidak valid`);
        continue;
      }

      const keterangan = idxKeterangan >= 0 ? (cols[idxKeterangan] || '').trim() : '';
      const saldoStr = idxSaldo >= 0 ? (cols[idxSaldo] || '').trim() : '';
      const refStr = idxRef >= 0 ? (cols[idxRef] || '').trim() : '';

      let amount = 0;
      let type = 'cr';

      if (idxMutasi >= 0) {
        // Format: "30000000.00 CR" atau "30000000.00 DB"
        const mutStr = (cols[idxMutasi] || '').trim().toUpperCase();
        const match = mutStr.match(/([\d,.]+)\s*(CR|DB|K|D)?/);
        if (match) {
          amount = parseAmount(match[1]);
          const t = match[2];
          if (t === 'DB' || t === 'D') type = 'db';
          else type = 'cr';
        }
      } else if (idxDebit >= 0 && idxKredit >= 0) {
        const debit = parseAmount(cols[idxDebit] || '0');
        const kredit = parseAmount(cols[idxKredit] || '0');
        if (debit > 0) { amount = debit; type = 'db'; }
        else if (kredit > 0) { amount = kredit; type = 'cr'; }
      }

      if (amount <= 0) {
        errors.push(`Row ${i}: amount = 0 atau tidak ke-parse`);
        continue;
      }

      // Override type kalau ada kolom type eksplisit
      if (idxType >= 0) {
        const t = (cols[idxType] || '').trim().toUpperCase();
        if (t === 'DB' || t === 'D' || t === 'DEBIT') type = 'db';
        else if (t === 'CR' || t === 'K' || t === 'KREDIT' || t === 'CREDIT') type = 'cr';
      }

      rows.push({
        tanggal,
        keterangan,
        amount,
        type,
        saldo: parseAmount(saldoStr) || null,
        reference: refStr || null,
        raw: Object.fromEntries(headers.map((h, j) => [h, cols[j] || ''])),
      });
    } catch (e) {
      errors.push(`Row ${i}: ${e.message}`);
    }
  }

  return { ok: true, rows, errors, headers };
}

function findIdx(headers, candidates) {
  for (const c of candidates) {
    const idx = headers.findIndex((h) => h.includes(c.toLowerCase()));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseRow(line, delim) {
  // Simple CSV parser yang handle quoted strings
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      current += '"';
      i++;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delim && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseDateID(s) {
  // Support: DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY, DD MMM YYYY
  if (!s) return null;
  s = s.trim();

  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;

  // DD/MM/YYYY atau DD-MM-YYYY
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m) {
    let year = m[3];
    if (year.length === 2) year = '20' + year;
    return `${year}-${pad(m[2])}-${pad(m[1])}`;
  }

  // DD MMM YYYY (e.g. "02 May 2026")
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec',
                    'mei','agt','agu','okt','des']; // ID variants
    const monthMap = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
                       jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
                       mei: '05', agt: '08', agu: '08', okt: '10', des: '12' };
    const monthKey = m[2].toLowerCase().slice(0, 3);
    if (monthMap[monthKey]) {
      return `${m[3]}-${monthMap[monthKey]}-${pad(m[1])}`;
    }
  }

  return null;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function parseAmount(s) {
  if (!s) return 0;
  // Handle "30.000.000,00" (ID) atau "30,000,000.00" (US)
  let cleaned = String(s).replace(/[^\d.,-]/g, '');
  // Decimal separator: cek apakah comma atau dot
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // Both — assume dot=thousand, comma=decimal (ID format)
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    // Cek apakah comma di posisi decimal (3 digits dari kanan)
    const parts = cleaned.split(',');
    if (parts[parts.length - 1].length === 2) {
      cleaned = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  }
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n) : 0;
}
