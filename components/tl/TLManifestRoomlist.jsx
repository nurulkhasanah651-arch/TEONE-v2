'use client';

// Portal TL — Manifest & Final Roomlist (read-only) untuk TL yang di-assign.
// Manifest: data paspor peserta. Roomlist: pakai final_roomlist tersimpan,
// kalau belum ada → auto-generate dari room type + gender + family.
import { useMemo, useState } from 'react';
import { generateRoomlist, normalizeGender } from '@/lib/utils/roomlist';
import { calcAge } from '@/lib/utils/format';
import { downloadRoomlistPDF } from '@/lib/utils/roomlist-pdf';
import { downloadManifestPDF } from '@/lib/utils/manifest-pdf';

function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return s; }
}

function tlMemberDetail(c = {}, pax = {}) {
  const first = c.first_name || (c.name ? c.name.split(' ')[0] : '');
  const last = c.surname || c.last_name || (c.name ? c.name.split(' ').slice(1).join(' ') : '');
  const g = normalizeGender({ gender: pax.gender || pax.sex || c.gender || c.sex });
  const birth = c.birthday || c.dob || c.date_of_birth;
  const age = calcAge(birth);
  const title = g === 'M' ? 'Mr' : g === 'F' ? ((age != null && age < 18) ? 'Miss' : 'Mrs') : '';
  return {
    name: c.name || first || '', first_name: first, surname: last, title, gender: g,
    passport_no: c.passport_no || c.passport_number || c.ktp || '',
    place_of_birth: c.place_of_birth || c.city || '',
    birth_date: fmtDate(birth), age: age == null ? '' : age,
  };
}

export default function TLManifestRoomlist({ trip, passengers = [], customerMap = {} }) {
  const [tab, setTab] = useState('manifest');

  const rooms = useMemo(() => {
    const customers = Object.values(customerMap);
    const custByName = {}; for (const c of customers) { if (c?.name) custByName[String(c.name).toLowerCase()] = c; }
    const saved = trip?.final_roomlist?.rooms;
    if (Array.isArray(saved) && saved.length > 0) {
      return saved.map((r, i) => ({
        room_no: r.room_no || i + 1,
        room_type: r.room_type,
        label: r.label,
        is_family: r.is_family,
        members: (r.members || []).map((m) => {
          const c = custByName[String(m.name || '').toLowerCase()] || {};
          const d = tlMemberDetail(c, { gender: m.gender });
          return { ...d, name: m.name || d.name, gender: m.gender || d.gender };
        }),
        note: r.note,
      }));
    }
    return generateRoomlist(passengers, customers).map((r) => ({
      room_no: r.room_no,
      room_type: r.room_type,
      label: r.label,
      is_family: r.is_family,
      members: (r.pax || []).map((p) => tlMemberDetail(customerMap[p.customer_id] || {}, p)),
      note: r.needs_upgrade ? r.upgrade_note : '',
    }));
  }, [trip, passengers, customerMap]);

  const isSavedFinal = Array.isArray(trip?.final_roomlist?.rooms) && trip.final_roomlist.rooms.length > 0;

  async function downloadManifestPdf() {
    try {
      const rows = passengers.map((p, idx) => {
        const c = customerMap[p.customer_id] || {};
        const g = normalizeGender({ gender: p.gender || p.sex || c.gender || c.sex });
        const first = c.first_name || (c.name ? c.name.split(' ')[0] : '');
        const last = c.surname || c.last_name || (c.name ? c.name.split(' ').slice(1).join(' ') : '');
        const birth = c.birthday || c.dob || c.date_of_birth;
        return [
          idx + 1, first, last,
          g === 'M' ? 'L' : g === 'F' ? 'P' : '',
          c.place_of_birth || c.city || '',
          fmtDate(birth), calcAge(birth) ?? '',
          c.passport_no || c.passport_number || '',
          fmtDate(c.passport_issued_date || c.issue_date),
          c.passport_issued_at || c.issuing_office || '',
          fmtDate(c.passport_expiry || c.expiry_date),
          c.phone || c.whatsapp || '',
        ];
      });
      await downloadManifestPDF({
        trip: { name: trip?.name, kode_trip: trip?.kode_trip, departure: trip?.departure, return_date: trip?.return_date, arrival: trip?.arrival },
        rows,
      });
    } catch (e) {
      alert('Gagal download Manifest: ' + (e?.message || e));
    }
  }

  async function downloadPdf() {
    try {
      await downloadRoomlistPDF({
        trip: { name: trip?.name, kode_trip: trip?.kode_trip, departure: trip?.departure, return_date: trip?.return_date, arrival: trip?.arrival },
        rooms,
      });
    } catch (e) {
      alert('Gagal download PDF: ' + (e?.message || e));
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
        <h2 className="font-bold text-brand-700 flex-1">📋 Manifest & Roomlist</h2>
        <button onClick={downloadManifestPdf} className="px-3 py-1 rounded font-semibold text-xs bg-emerald-600 hover:bg-emerald-700 text-white">📋 Manifest PDF</button>
        <button onClick={downloadPdf} className="px-3 py-1 rounded font-semibold text-xs bg-rose-600 hover:bg-rose-700 text-white">🛏 Roomlist PDF</button>
        <div className="flex gap-1 text-xs">
          <button
            onClick={() => setTab('manifest')}
            className={`px-3 py-1 rounded font-semibold ${tab === 'manifest' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600'}`}
          >Manifest</button>
          <button
            onClick={() => setTab('roomlist')}
            className={`px-3 py-1 rounded font-semibold ${tab === 'roomlist' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600'}`}
          >Roomlist {isSavedFinal && '✓'}</button>
        </div>
      </div>

      {tab === 'manifest' ? (
        <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full text-xs [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 text-left text-[11px] font-bold text-slate-600 uppercase">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">First Name</th>
                <th className="px-3 py-2">Last Name</th>
                <th className="px-3 py-2">L/P</th>
                <th className="px-3 py-2">Tempat Lahir</th>
                <th className="px-3 py-2">Tgl Lahir</th>
                <th className="px-3 py-2">Umur</th>
                <th className="px-3 py-2">No. Paspor</th>
                <th className="px-3 py-2">Issue</th>
                <th className="px-3 py-2">Office</th>
                <th className="px-3 py-2">Expired</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {passengers.map((p, idx) => {
                const c = customerMap[p.customer_id] || {};
                const g = normalizeGender({ gender: p.gender || p.sex || c.gender || c.sex });
                const first = c.first_name || (c.name ? c.name.split(' ')[0] : '');
                const last = c.surname || c.last_name || (c.name ? c.name.split(' ').slice(1).join(' ') : '');
                const birth = c.birthday || c.dob || c.date_of_birth;
                return (
                  <tr key={p.id}>
                    <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800">{first || '—'}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800">{last || '—'}</td>
                    <td className="px-3 py-2">{g === 'M' ? 'L' : g === 'F' ? 'P' : '—'}</td>
                    <td className="px-3 py-2">{c.place_of_birth || c.city || '—'}</td>
                    <td className="px-3 py-2">{fmtDate(birth)}</td>
                    <td className="px-3 py-2">{calcAge(birth) ?? '—'}</td>
                    <td className="px-3 py-2 font-mono">{c.passport_no || c.passport_number || '—'}</td>
                    <td className="px-3 py-2">{fmtDate(c.passport_issued_date || c.issue_date)}</td>
                    <td className="px-3 py-2">{c.passport_issued_at || c.issuing_office || '—'}</td>
                    <td className="px-3 py-2">{fmtDate(c.passport_expiry || c.expiry_date)}</td>
                  </tr>
                );
              })}
              {passengers.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-slate-500">Belum ada peserta.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-4">
          {!isSavedFinal && (
            <p className="mb-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              ⓘ Roomlist ini disusun otomatis (belum di-finalkan tim ops). Bisa berubah.
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {rooms.map((r) => (
              <div key={r.room_no} className={`border rounded-lg p-3 ${r.is_family ? 'border-pink-200 bg-pink-50/40' : 'border-slate-200 bg-slate-50/50'}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] font-bold text-slate-700">Room {r.room_no} · {(r.room_type || '?').toUpperCase()}</p>
                  {r.is_family && <span className="text-[9px] px-1.5 py-0.5 bg-pink-100 text-pink-700 rounded font-bold">FAMILY</span>}
                </div>
                {r.label && <p className="text-[10px] text-slate-500 mb-1">{r.label}</p>}
                <ul className="space-y-0.5">
                  {r.members.map((m, i) => (
                    <li key={i} className="text-[11px] text-slate-800">
                      • {m.name}{m.gender && m.gender !== '?' && <span className="text-[9px] text-slate-400"> ({m.gender === 'M' ? 'L' : 'P'})</span>}
                    </li>
                  ))}
                </ul>
                {r.note && <p className="mt-1 text-[10px] text-red-600 font-semibold">🔔 {r.note}</p>}
              </div>
            ))}
            {rooms.length === 0 && <p className="text-sm text-slate-500 col-span-full text-center py-4">Belum ada roomlist.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
