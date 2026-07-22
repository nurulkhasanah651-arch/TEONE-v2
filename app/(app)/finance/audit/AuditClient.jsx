'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { syncTripPriceToMaster } from '@/lib/actions/billing-audit';

const rp = (v) => 'Rp ' + Math.round(Number(v) || 0).toLocaleString('id-ID');
const fmtTgl = (x) => { if (!x) return '—'; const d = new Date(String(x) + 'T00:00:00'); return isNaN(d) ? '—' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); };

export default function AuditClient({ trips = [], ringkas }) {
  const router = useRouter();
  const [hanyaSelisih, setHanyaSelisih] = useState(true);
  const [q, setQ] = useState('');
  const [buka, setBuka] = useState({});
  const [syncing, setSyncing] = useState('');
  const [msg, setMsg] = useState('');

  async function handleSync(tripId, kode) {
    if (!confirm(`Samakan harga SEMUA peserta trip ${kode} ke harga Master Trip?\n\nHarga kamar + biaya wajib (perlengkapan dll) jadi patokan → "Penyesuaian harga khusus" hilang.\n\n⚠ Ini menimpa harga khusus/nego jadi harga master. Pembayaran yang sudah masuk & diskon TIDAK berubah.`)) return;
    setSyncing(tripId); setMsg('');
    try {
      const r = await syncTripPriceToMaster(tripId);
      if (r?.error) { setMsg(`❌ ${kode}: ${r.error}`); }
      else { setMsg(`✅ ${kode}: ${r.updated} peserta disamakan ke harga master${r.sudahSama ? `, ${r.sudahSama} sudah sesuai` : ''}${r.skipped ? `, ${r.skipped} dilewati (harga master kosong)` : ''}.`); router.refresh(); }
    } catch (e) { setMsg(`❌ ${kode}: ${e.message}`); }
    finally { setSyncing(''); }
  }

  const tampil = useMemo(() => {
    let t = trips;
    if (hanyaSelisih) t = t.filter((x) => x.jmlBermasalah > 0);
    const s = q.trim().toLowerCase();
    if (s) t = t.filter((x) => `${x.kode} ${x.nama}`.toLowerCase().includes(s));
    return t;
  }, [trips, hanyaSelisih, q]);

  const aman = (ringkas?.paxBermasalah || 0) === 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-brand-700">🔍 Audit Tagihan</h1>
        <p className="text-sm text-slate-500 mt-1">
          Tagihan dihitung <b>ulang dari harga Master Trip</b> (harga kamar + biaya wajib + visa/asuransi include
          + biaya tambahan CS − diskon), lalu dibandingkan dengan angka yang dipakai sistem.
          Kalau ada selisih, berarti ada yang salah — periksa di sini sebelum menagih.
        </p>
      </div>

      <div className={`rounded-xl border-2 p-4 ${aman ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'}`}>
        <p className={`text-sm font-bold ${aman ? 'text-emerald-800' : 'text-red-800'}`}>
          {aman ? '✅ Tidak ada selisih — semua tagihan sesuai harga Master Trip.'
                : `⚠ ${ringkas.paxBermasalah} peserta bermasalah · selisih ${rp(ringkas.nilaiSelisih)}`}
        </p>
        {ringkas?.tripTanpaHarga > 0 && (
          <p className="text-xs text-amber-800 mt-1 font-semibold">
            ⚠ {ringkas.tripTanpaHarga} trip harganya belum diisi di Master Trip — tagihannya tidak bisa dihitung.
          </p>
        )}
      </div>

      {msg && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">{msg}</div>
      )}
      <p className="text-xs text-slate-500">
        💡 Tombol <b>⚖ Samakan ke Master</b> (di baris trip yang ada selisih) menyetel <code>price_paid</code> tiap peserta = harga Master Trip,
        supaya <b>"Penyesuaian harga khusus"</b> tidak muncul lagi di invoice. Peserta baru sudah otomatis pakai harga master.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kartu label="Seharusnya ditagih" nilai={rp(ringkas?.totalSeharusnya)} warna="text-slate-800" />
        <Kartu label="Sudah dibayar" nilai={rp(ringkas?.totalDibayar)} warna="text-emerald-700" />
        <Kartu label="Sisa tagihan" nilai={rp(ringkas?.totalSisa)} warna="text-amber-700" />
        <Kartu label="Selisih sistem" nilai={rp(ringkas?.nilaiSelisih)} warna={(ringkas?.nilaiSelisih || 0) === 0 ? 'text-emerald-700' : 'text-red-700'}
               catatan={(ringkas?.nilaiSelisih || 0) > 0 ? 'sistem KURANG tagih' : (ringkas?.nilaiSelisih || 0) < 0 ? 'sistem LEBIH tagih' : 'pas'} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode / nama trip…"
               className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm" />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={hanyaSelisih} onChange={(e) => setHanyaSelisih(e.target.checked)}
                 className="h-4 w-4 rounded border-slate-400" />
          Hanya tampilkan yang ada selisih
        </label>
        <span className="text-xs text-slate-400 ml-auto">{tampil.length} trip · {ringkas?.totalPax} peserta total</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr>
              <th className="px-3 py-2.5 text-left">Trip</th>
              <th className="px-3 py-2.5 text-center">Pax</th>
              <th className="px-3 py-2.5 text-right">Seharusnya</th>
              <th className="px-3 py-2.5 text-right">Dipakai sistem</th>
              <th className="px-3 py-2.5 text-right">Selisih</th>
              <th className="px-3 py-2.5 text-right">Dibayar</th>
              <th className="px-3 py-2.5 text-right">Sisa</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {tampil.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                {hanyaSelisih ? '✅ Tidak ada trip yang bermasalah.' : 'Tidak ada trip.'}
              </td></tr>
            )}
            {tampil.map((t) => {
              const ada = t.jmlBermasalah > 0;
              const open = !!buka[t.id];
              return (
                <>
                  <tr key={t.id} className={`border-t border-slate-100 ${ada ? 'bg-red-50/40' : ''}`}>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-slate-800">{t.kode}</div>
                      <div className="text-xs text-slate-500 truncate max-w-[260px]">{t.nama}</div>
                      <div className="text-[10px] text-slate-400">{fmtTgl(t.departure)}</div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {t.pax}
                      {ada && <div className="text-[10px] font-bold text-red-600">{t.jmlBermasalah} bermasalah</div>}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{rp(t.seharusnya)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{rp(t.dipakaiSistem)}</td>
                    <td className={`px-3 py-2 text-right font-bold ${t.selisih === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {t.selisih === 0 ? '—' : rp(t.selisih)}
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-700">{rp(t.dibayar)}</td>
                    <td className="px-3 py-2 text-right text-amber-700 font-semibold">{rp(t.sisa)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {ada && (
                        <button onClick={() => handleSync(t.id, t.kode)} disabled={syncing === t.id}
                                title="Set price_paid semua peserta = harga Master Trip (hilangkan Penyesuaian harga khusus)"
                                className="text-xs px-2 py-1 mr-1 rounded bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold">
                          {syncing === t.id ? '⏳' : '⚖ Samakan ke Master'}
                        </button>
                      )}
                      <button onClick={() => setBuka((b) => ({ ...b, [t.id]: !b[t.id] }))}
                              className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50">
                        {open ? 'Tutup' : 'Rincian'}
                      </button>
                    </td>
                  </tr>
                  {open && (
                    <tr key={t.id + '-d'} className="border-t border-slate-100 bg-slate-50/60">
                      <td colSpan={8} className="px-3 py-3">
                        <table className="w-full text-xs">
                          <thead className="text-slate-500">
                            <tr>
                              <th className="px-2 py-1 text-left">Peserta</th>
                              <th className="px-2 py-1 text-left">Kamar</th>
                              <th className="px-2 py-1 text-right">Harga Master</th>
                              <th className="px-2 py-1 text-right">Visa/Asr</th>
                              <th className="px-2 py-1 text-right">Tambahan</th>
                              <th className="px-2 py-1 text-right">Diskon</th>
                              <th className="px-2 py-1 text-right">Seharusnya</th>
                              <th className="px-2 py-1 text-right">Sistem</th>
                              <th className="px-2 py-1 text-right">Selisih</th>
                              <th className="px-2 py-1 text-right">Dibayar</th>
                              <th className="px-2 py-1 text-right">Sisa</th>
                            </tr>
                          </thead>
                          <tbody>
                            {t.baris
                              .filter((b) => !hanyaSelisih || b.selisih !== 0 || b.tanpaHarga)
                              .map((b) => (
                              <tr key={b.paxId} className={b.selisih !== 0 || b.tanpaHarga ? 'bg-red-100/50' : ''}>
                                <td className="px-2 py-1 font-medium text-slate-700">{b.nama}</td>
                                <td className="px-2 py-1 text-slate-500">
                                  {b.roomType}{b.ageType !== 'adult' ? ` · ${b.ageType}` : ''}
                                </td>
                                <td className="px-2 py-1 text-right">{b.tanpaHarga ? <span className="text-amber-700 font-bold">harga trip kosong</span> : rp(b.hargaMaster)}</td>
                                <td className="px-2 py-1 text-right text-slate-500">{(b.visaOpt + b.asrOpt) ? rp(b.visaOpt + b.asrOpt) : '—'}</td>
                                <td className="px-2 py-1 text-right text-slate-500">{b.addon ? rp(b.addon) : '—'}</td>
                                <td className="px-2 py-1 text-right text-emerald-700">{b.diskon ? '−' + rp(b.diskon) : '—'}</td>
                                <td className="px-2 py-1 text-right font-semibold">{rp(b.seharusnya)}</td>
                                <td className="px-2 py-1 text-right text-slate-600">{rp(b.dipakaiSistem)}</td>
                                <td className={`px-2 py-1 text-right font-bold ${b.selisih === 0 ? 'text-slate-300' : 'text-red-600'}`}>
                                  {b.selisih === 0 ? '—' : rp(b.selisih)}
                                </td>
                                <td className="px-2 py-1 text-right text-emerald-700">{rp(b.dibayar)}</td>
                                <td className="px-2 py-1 text-right text-amber-700">{rp(b.sisa)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="text-[10px] text-slate-400 mt-2">
                          Selisih &gt; 0 = sistem menagih KURANG dari harga Master Trip. Kalau muncul, cek harga kamar di Master Trip
                          dan tipe kamar peserta.
                        </p>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kartu({ label, nilai, warna, catatan }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${warna}`}>{nilai}</p>
      {catatan && <p className="text-[10px] text-slate-400">{catatan}</p>}
    </div>
  );
}
