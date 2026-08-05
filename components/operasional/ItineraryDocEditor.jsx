'use client';

// Editor Itinerary Only + generator PDF (format seperti contoh 511 itn.pdf):
// header banner navy, tabel Detail Penerbangan, tabel Jadwal Perjalanan Harian.
// Path: components/operasional/ItineraryDocEditor.jsx
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { saveItineraryDoc } from '@/lib/actions/itinerary-doc';

const NAVY = [30, 42, 90];
const ACCENT = [59, 91, 191];
const PILLBG = [227, 232, 246];
const LIGHT = [244, 246, 251];

export default function ItineraryDocEditor({ trip, doc: initial }) {
  const [title, setTitle] = useState(initial.title || '');
  const [subtitle, setSubtitle] = useState(initial.subtitle || '');
  const [airline, setAirline] = useState(initial.airline || '');
  const [flights, setFlights] = useState(initial.flights?.length ? initial.flights : [{ code: '', date: '', route: '', time: '' }]);
  const [days, setDays] = useState(initial.days?.length ? initial.days.map((d) => ({ ...d, activities: Array.isArray(d.activities) ? d.activities.join('\n') : (d.activities || '') })) : [{ day: 'Day 1', date: '', route: '', activities: '', highlight: false }]);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState('');

  const setFlight = (i, k, v) => setFlights((a) => a.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  const addFlight = () => setFlights((a) => [...a, { code: '', date: '', route: '', time: '' }]);
  const delFlight = (i) => setFlights((a) => a.filter((_, j) => j !== i));
  const setDay = (i, k, v) => setDays((a) => a.map((d, j) => (j === i ? { ...d, [k]: v } : d)));
  const addDay = () => setDays((a) => [...a, { day: `Day ${a.length + 1}`, date: '', route: '', activities: '', highlight: false }]);
  const delDay = (i) => setDays((a) => a.filter((_, j) => j !== i));

  function payload() {
    return {
      title, subtitle, airline,
      flights,
      days: days.map((d) => ({ day: d.day, date: d.date, route: d.route, activities: d.activities, highlight: !!d.highlight })),
    };
  }

  function save() {
    setMsg('');
    start(async () => {
      const r = await saveItineraryDoc(trip.id, payload());
      if (r?.error) { setMsg('❌ ' + r.error); return; }
      setMsg('✅ Tersimpan');
    });
  }

  async function downloadPDF() {
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = pdf.internal.pageSize.getWidth();
    const M = 40;

    // ── Header banner ──
    pdf.setFillColor(...NAVY); pdf.rect(0, 0, W, 96, 'F');
    pdf.setFillColor(...ACCENT); pdf.rect(0, 96, W, 5, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(19);
    pdf.text((title || 'ITINERARY').toUpperCase(), M, 46, { maxWidth: W - M * 2 });
    if (subtitle) { pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(205, 214, 240); pdf.text(subtitle, M, 70, { maxWidth: W - M * 2 }); }

    let y = 128;
    const sectionTitle = (t) => {
      pdf.setTextColor(...NAVY); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12);
      pdf.text(t, M, y);
      pdf.setDrawColor(220, 224, 235); pdf.setLineWidth(0.8); pdf.line(M, y + 6, W - M, y + 6);
      y += 16;
    };

    // ── Detail Penerbangan ──
    const fRows = flights.filter((f) => f.code || f.route || f.date || f.time);
    if (fRows.length) {
      sectionTitle(`DETAIL PENERBANGAN${airline ? ` (${airline.toUpperCase()})` : ''}`);
      autoTable(pdf, {
        startY: y,
        margin: { left: M, right: M },
        head: [['Kode Flight', 'Tanggal', 'Rute', 'Jam (Lokal)']],
        body: fRows.map((f) => [f.code || '', f.date || '', f.route || '', f.time || '']),
        theme: 'plain',
        headStyles: { fillColor: LIGHT, textColor: [90, 100, 120], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9.5, textColor: [45, 55, 72], cellPadding: 6 },
        alternateRowStyles: { fillColor: [250, 251, 253] },
        columnStyles: { 0: { fontStyle: 'bold', textColor: ACCENT, cellWidth: 90 }, 1: { cellWidth: 90 }, 3: { cellWidth: 120 } },
        didDrawPage: () => { drawFooter(pdf, W); },
      });
      y = pdf.lastAutoTable.finalY + 22;
    }

    // ── Jadwal Perjalanan Harian ──
    const dRows = days.filter((d) => d.day || d.route || (d.activities && d.activities.trim()));
    if (dRows.length) {
      if (y > pdf.internal.pageSize.getHeight() - 120) { pdf.addPage(); y = 60; }
      sectionTitle('JADWAL PERJALANAN HARIAN');
      autoTable(pdf, {
        startY: y,
        margin: { left: M, right: M },
        head: [['HARI', 'RUTE', 'KEGIATAN / DESTINASI UTAMA']],
        body: dRows.map((d) => {
          const acts = String(d.activities || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
          const kegiatan = acts.map((a) => '•  ' + a).join('\n') + (d.highlight ? '\n★  HIGHLIGHT' : '');
          return [`${d.day || ''}\n${d.date || ''}`, d.route || '', kegiatan];
        }),
        theme: 'plain',
        headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9, textColor: [45, 55, 72], cellPadding: 7, valign: 'top' },
        alternateRowStyles: { fillColor: [249, 250, 252] },
        columnStyles: { 0: { cellWidth: 120, fontStyle: 'bold', textColor: NAVY }, 1: { cellWidth: 110, fontStyle: 'bold', textColor: [55, 65, 90] } },
        didDrawPage: () => { drawFooter(pdf, W); },
      });
    }

    const safe = (trip.kode || trip.id) + '_itinerary';
    pdf.save(`${safe}.pdf`);
  }

  function drawFooter(pdf, W) {
    const H = pdf.internal.pageSize.getHeight();
    const n = pdf.internal.getNumberOfPages();
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(150, 158, 175);
    pdf.text(`Halaman ${n}`, W - 40, H - 20, { align: 'right' });
  }

  const inp = 'w-full px-2 py-1.5 border border-slate-300 rounded text-sm';

  return (
    <div className="space-y-5">
      <div className="no-print flex items-center justify-between flex-wrap gap-2">
        <Link href="/operasional/itinerary" className="text-sm text-brand-600 font-medium hover:underline">← Pilih trip lain</Link>
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs font-semibold text-slate-500">{msg}</span>}
          <button type="button" onClick={save} disabled={busy} className="px-3 py-1.5 text-sm font-semibold rounded-lg border border-brand-300 text-brand-700 hover:bg-brand-50 disabled:opacity-50">💾 Simpan</button>
          <button type="button" onClick={downloadPDF} className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700">⬇ Download PDF</button>
        </div>
      </div>

      <h1 className="text-2xl font-bold text-brand-700">🧭 Itinerary — {trip.kode} {trip.name}</h1>

      {/* Judul & subjudul */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div>
          <label className="text-xs font-semibold text-slate-500">Judul Itinerary</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="mis. ITINERARY HUNTING AURORA RUSSIA" className={inp} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">Sub-judul / periode</label>
            <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="mis. 23 Desember 2026 – 03 Januari 2027" className={inp} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Maskapai (header tabel flight)</label>
            <input value={airline} onChange={(e) => setAirline(e.target.value)} placeholder="mis. AIR CHINA" className={inp} />
          </div>
        </div>
      </div>

      {/* Detail Penerbangan */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-slate-800">✈ Detail Penerbangan</h2>
          <button type="button" onClick={addFlight} className="text-xs font-semibold text-brand-600 hover:underline">+ Tambah flight</button>
        </div>
        <div className="space-y-2">
          <div className="hidden sm:grid grid-cols-12 gap-2 text-[10px] font-bold uppercase text-slate-400 px-1">
            <span className="col-span-2">Kode Flight</span><span className="col-span-3">Tanggal</span><span className="col-span-4">Rute</span><span className="col-span-2">Jam (Lokal)</span><span />
          </div>
          {flights.map((f, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <input value={f.code} onChange={(e) => setFlight(i, 'code', e.target.value)} placeholder="CA 978" className={`${inp} col-span-2`} />
              <input value={f.date} onChange={(e) => setFlight(i, 'date', e.target.value)} placeholder="24 Des 2026" className={`${inp} col-span-3`} />
              <input value={f.route} onChange={(e) => setFlight(i, 'route', e.target.value)} placeholder="Jakarta (CGK) – Beijing (PEK)" className={`${inp} col-span-4`} />
              <input value={f.time} onChange={(e) => setFlight(i, 'time', e.target.value)} placeholder="01:45 – 09:55" className={`${inp} col-span-2`} />
              <button type="button" onClick={() => delFlight(i)} className="col-span-1 text-slate-300 hover:text-red-500 text-sm">✕</button>
            </div>
          ))}
          {flights.length === 0 && <p className="text-xs text-slate-400">Belum ada flight — klik "+ Tambah flight".</p>}
        </div>
      </div>

      {/* Jadwal Harian */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-slate-800">🗓 Jadwal Perjalanan Harian</h2>
          <button type="button" onClick={addDay} className="text-xs font-semibold text-brand-600 hover:underline">+ Tambah hari</button>
        </div>
        <div className="space-y-3">
          {days.map((d, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="grid grid-cols-12 gap-2">
                <input value={d.day} onChange={(e) => setDay(i, 'day', e.target.value)} placeholder="Day 1" className={`${inp} col-span-3`} />
                <input value={d.date} onChange={(e) => setDay(i, 'date', e.target.value)} placeholder="Rabu, 23 Des 2026" className={`${inp} col-span-4`} />
                <input value={d.route} onChange={(e) => setDay(i, 'route', e.target.value)} placeholder="Jakarta – Beijing" className={`${inp} col-span-4`} />
                <button type="button" onClick={() => delDay(i)} className="col-span-1 text-slate-300 hover:text-red-500 text-sm">✕</button>
              </div>
              <textarea value={d.activities} onChange={(e) => setDay(i, 'activities', e.target.value)} rows={3}
                placeholder="Satu kegiatan per baris (jadi bullet di PDF)…" className={`${inp} resize-y`} />
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={!!d.highlight} onChange={(e) => setDay(i, 'highlight', e.target.checked)} /> Tandai highlight
              </label>
            </div>
          ))}
          {days.length === 0 && <p className="text-xs text-slate-400">Belum ada hari — klik "+ Tambah hari".</p>}
        </div>
      </div>
    </div>
  );
}
