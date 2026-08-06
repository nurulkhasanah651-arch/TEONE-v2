// Parser jadwal penerbangan dari CATATAN PNR (flight_inventory.notes) — dipakai bersama
// oleh Itinerary Only & Tour Confirmation. Modul murni (bukan 'use server').
// Path: lib/utils/pnr-flights.js

const MONTHS_MAP = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, MEI: 4, JUN: 5, JUL: 6, AUG: 7, AGU: 7, SEP: 8, OCT: 9, OKT: 9, NOV: 10, DEC: 11, DES: 11 };
const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const AIRLINE_NAME = { CA: 'Air China', SV: 'Saudia', MF: 'Xiamen Air', EY: 'Etihad Airways', EK: 'Emirates', QR: 'Qatar Airways', TK: 'Turkish Airlines', GA: 'Garuda Indonesia', SQ: 'Singapore Airlines', MH: 'Malaysia Airlines', CX: 'Cathay Pacific', ET: 'Ethiopian Airlines', KL: 'KLM', QZ: 'AirAsia', JT: 'Lion Air', ID: 'Batik Air', CZ: 'China Southern', MU: 'China Eastern', HU: 'Hainan Airlines', QF: 'Qantas' };

const _str = (v) => (v == null ? '' : String(v));
function _d(s) { if (!s) return null; try { const dt = new Date(String(s).slice(0, 10) + 'T00:00:00'); return isNaN(dt) ? null : dt; } catch { return null; } }
function fmtShort(s) { const dt = _d(s); if (!dt) return ''; return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); }
function _normTime(t) {
  const s = String(t).trim();
  if (s.includes(':')) return s;                 // "20:00" tetap
  const d = s.replace(/\D/g, '');
  return d.length >= 3 ? `${d.slice(0, -2)}:${d.slice(-2)}` : s; // "0630" → "06:30"
}

// Parse baris catatan PNR jadi segmen flight. Fleksibel:
//   "CA 476 12 NOV CGKTFU 23:05 05:45+1"  atau  "QF 040 06NOV CGKMEL 20:00 0630+1"
// Baris bisa punya alternatif setelah ">>" (ambil yang pertama).
export function parseNotesFlights(notes, depDateStr) {
  const text = _str(notes);
  if (!text.trim()) return { flights: [], airlineCode: '' };
  const dep = _d(depDateStr);
  const depYear = dep ? dep.getFullYear() : null;
  const depMonth = dep ? dep.getMonth() : null;
  const re = /([A-Z]{2})\s*(\d{2,4})\s+(\d{1,2})\s*([A-Za-z]{3})\s+([A-Z]{3})([A-Z]{3})\s+(\d{1,2}:?\d{2})\s+(\d{1,2}:?\d{2})\s*(\+\s*\d)?/;
  const flights = [];
  let airlineCode = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('>>')[0].trim();
    if (!line) continue;
    const m = re.exec(line.toUpperCase());
    if (!m) continue;
    const [, al, num, day, monRaw, from, to, dep1, arr1, plus] = m;
    if (!airlineCode) airlineCode = al;
    const mon = MONTHS_MAP[monRaw.toUpperCase()];
    let dateStr = `${parseInt(day)} ${monRaw[0].toUpperCase() + monRaw.slice(1, 3).toLowerCase()}`;
    if (mon != null) {
      let yr = depYear;
      if (yr != null && depMonth != null && mon < depMonth) yr = depYear + 1;
      dateStr = `${parseInt(day)} ${MONTHS_ID[mon]}${yr != null ? ` ${yr}` : ''}`;
    }
    flights.push({
      code: `${al} ${num}`,
      date: dateStr,
      route: `${from} – ${to}`,
      time: `${_normTime(dep1)} – ${_normTime(arr1)}${plus ? ' +1' : ''}`,
    });
  }
  return { flights, airlineCode };
}

// Bangun baris flight dari PNR Inventory: utamakan CATATAN (detail lengkap),
// fallback ke routes (string kode bandara) / route_from-route_to.
export function flightsFromInventory(fiRows) {
  const rows = (fiRows || []).slice().sort((a, b) => String(a.departure_date || '').localeCompare(String(b.departure_date || '')));
  const out = [];
  let airlineName = '';
  for (const fi of rows) {
    const parsed = parseNotesFlights(fi.notes, fi.departure_date);
    if (parsed.flights.length) {
      if (!airlineName) airlineName = _str(fi.airline).trim() || AIRLINE_NAME[parsed.airlineCode] || parsed.airlineCode || '';
      out.push(...parsed.flights);
      continue;
    }
    const routeStrs = Array.isArray(fi.routes) ? fi.routes : (fi.routes ? [fi.routes] : []);
    const legs = [];
    for (const rs of routeStrs) {
      const codes = String(rs).toUpperCase().split(/[-→>\s]+/).map((s) => s.trim()).filter(Boolean);
      if (codes.length >= 2 && codes.length % 2 === 0) {
        for (let i = 0; i < codes.length; i += 2) legs.push(`${codes[i]} – ${codes[i + 1]}`);
      } else {
        for (let i = 0; i < codes.length - 1; i++) legs.push(`${codes[i]} – ${codes[i + 1]}`);
      }
    }
    if (!legs.length && (fi.route_from || fi.route_to)) legs.push(`${String(fi.route_from || '').toUpperCase()} – ${String(fi.route_to || '').toUpperCase()}`.trim());
    if (!airlineName) airlineName = _str(fi.airline).trim() || '';
    legs.forEach((leg, i) => {
      const isFirst = i === 0, isLast = i === legs.length - 1;
      out.push({ code: '', date: isFirst ? fmtShort(fi.departure_date) : (isLast && fi.return_date ? fmtShort(fi.return_date) : ''), route: leg, time: '' });
    });
  }
  return { flights: out, airlineName };
}

// Versi teks (1 penerbangan per baris) untuk field Tour Confirmation `detail_flight`.
export function flightLinesFromInventory(fiRows) {
  const { flights } = flightsFromInventory(fiRows);
  return flights
    .map((f) => [f.code, f.date, f.route, f.time].filter(Boolean).join('  ·  '))
    .filter(Boolean)
    .join('\n');
}
