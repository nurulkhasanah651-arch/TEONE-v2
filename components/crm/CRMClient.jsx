'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

function fmtRupiah(n) { return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); }
function fmtDate(s) { if (!s) return '—'; try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; } }

const STATUS_BADGE = {
  lead:   { label: 'Lead',   cls: 'bg-slate-100 text-slate-600' },
  new:    { label: 'Baru',   cls: 'bg-blue-100 text-blue-700' },
  repeat: { label: 'Repeat', cls: 'bg-green-100 text-green-700' },
  vip:    { label: 'VIP',    cls: 'bg-yellow-100 text-yellow-800' },
};

function Stat({ label, value, cls }) {
  return (
    <button className={`p-3 rounded-lg text-center ${cls}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </button>
  );
}

export default function CRMClient({ customers = [], stats }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [sort, setSort] = useState('spent');
  const [onlyBlacklist, setOnlyBlacklist] = useState(false);
  const [limit, setLimit] = useState(500);

  const sources = useMemo(
    () => [...new Set(customers.map((c) => c.referral_source).filter(Boolean))].sort(),
    [customers]
  );

  const filtered = useMemo(() => {
    let arr = customers.filter((c) => {
      if (status && c.status !== status) return false;
      if (source && c.referral_source !== source) return false;
      if (onlyBlacklist && !c.is_blacklisted) return false;
      if (q) {
        const t = q.toLowerCase();
        const hay = `${c.name || ''} ${c.phone || ''} ${c.whatsapp || ''} ${c.email || ''} ${c.city || ''} ${(c.tags || []).join(' ')}`.toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
    arr = [...arr].sort((a, b) => {
      if (sort === 'spent') return (b.total_spent || 0) - (a.total_spent || 0);
      if (sort === 'trips') return (b.total_trips || 0) - (a.total_trips || 0);
      if (sort === 'recent') return new Date(b.last_trip_at || 0) - new Date(a.last_trip_at || 0);
      if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
      return 0;
    });
    return arr;
  }, [customers, q, status, source, sort, onlyBlacklist]);

  const shown = filtered.slice(0, limit);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
        <Stat label="Total" value={stats.total} cls="bg-white border border-slate-200 text-slate-700" />
        <Stat label="Lead" value={stats.lead} cls="bg-slate-50 text-slate-700" />
        <Stat label="Baru" value={stats.baru} cls="bg-blue-50 text-blue-700" />
        <Stat label="Repeat" value={stats.repeat} cls="bg-green-50 text-green-700" />
        <Stat label="VIP" value={stats.vip} cls="bg-yellow-50 text-yellow-800" />
        <Stat label="🎂 Bln Ini" value={stats.birthdayThisMonth} cls="bg-pink-50 text-pink-700" />
        <Stat label="Blacklist" value={stats.blacklist} cls="bg-red-50 text-red-700" />
      </div>
      <div className="bg-brand-50 border border-brand-200 rounded-lg p-3 text-sm">
        💰 Total nilai customer (lifetime): <strong className="text-brand-700">{fmtRupiah(stats.totalRevenue)}</strong>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap gap-2 items-center">
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama / HP / email / kota / tag…"
          className="flex-1 min-w-[200px] px-3 py-1.5 border border-slate-300 rounded text-sm"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-2 py-1.5 border border-slate-300 rounded text-sm">
          <option value="">Semua Status</option>
          <option value="lead">Lead</option>
          <option value="new">Baru</option>
          <option value="repeat">Repeat</option>
          <option value="vip">VIP</option>
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className="px-2 py-1.5 border border-slate-300 rounded text-sm">
          <option value="">Semua Sumber</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="px-2 py-1.5 border border-slate-300 rounded text-sm">
          <option value="spent">Belanja terbesar</option>
          <option value="trips">Trip terbanyak</option>
          <option value="recent">Trip terakhir</option>
          <option value="name">Nama A-Z</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-red-700 font-semibold">
          <input type="checkbox" checked={onlyBlacklist} onChange={(e) => setOnlyBlacklist(e.target.checked)} /> Blacklist
        </label>
      </div>

      <p className="text-xs text-slate-500">{filtered.length.toLocaleString('id-ID')} customer{shown.length < filtered.length ? ` — menampilkan ${shown.length.toLocaleString('id-ID')} pertama (pakai pencarian/filter untuk menyaring)` : ''}</p>

      {/* List */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-left text-[11px] font-bold text-slate-600 uppercase">
            <tr>
              <th className="px-3 py-2">Nama</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Kontak</th>
              <th className="px-3 py-2">Kota</th>
              <th className="px-3 py-2">Sumber</th>
              <th className="px-3 py-2 text-center">Trip</th>
              <th className="px-3 py-2 text-right">Total Belanja</th>
              <th className="px-3 py-2">Trip Terakhir</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((c) => {
              const b = STATUS_BADGE[c.status] || STATUS_BADGE.lead;
              return (
                <tr key={c.id} className={`hover:bg-slate-50 ${c.is_blacklisted ? 'bg-red-50/40' : ''}`}>
                  <td className="px-3 py-2">
                    <Link href={`/crm/${c.id}`} className="font-semibold text-brand-700 hover:underline">{c.name || '—'}</Link>
                    {c.is_blacklisted && <span className="ml-1 text-[9px] px-1 bg-red-100 text-red-700 rounded font-bold">BLACKLIST</span>}
                    {(c.tags || []).length > 0 && <span className="ml-1 text-[9px] text-slate-400">#{(c.tags || []).join(' #')}</span>}
                  </td>
                  <td className="px-3 py-2"><span className={`text-[10px] px-2 py-0.5 rounded font-bold ${b.cls}`}>{b.label}</span></td>
                  <td className="px-3 py-2 text-xs text-slate-600">{c.phone || c.whatsapp || '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{c.city || '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{c.referral_source || '—'}</td>
                  <td className="px-3 py-2 text-center font-semibold">{c.total_trips || 0}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-800">{fmtRupiah(c.total_spent)}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{fmtDate(c.last_trip_at)}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">Tidak ada customer cocok filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {shown.length < filtered.length && (
        <div className="text-center">
          <button
            onClick={() => setLimit((n) => n + 1000)}
            className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700"
          >
            Muat lebih banyak ({(filtered.length - shown.length).toLocaleString('id-ID')} lagi)
          </button>
        </div>
      )}
    </div>
  );
}
