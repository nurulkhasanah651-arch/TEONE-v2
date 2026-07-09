'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { getPaymentDeadlineAlerts, sendPaymentReminder, updateInvoiceDueDate } from '@/lib/actions/payment-reminders';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';

export default function PaymentReminderPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [, start] = useTransition();
  const [msg, setMsg] = useState('');
  const [pic, setPic] = useState('');

  async function load(picValue = pic) {
    setLoading(true);
    const r = await getPaymentDeadlineAlerts({ picFilter: picValue });
    setLoading(false);
    if (!r?.error) setData(r);
  }
  useEffect(() => { load(''); }, []);

  function pilihPic(value) {
    setPic(value);
    load(value);
  }

  function kirim(inv) {
    if (!inv.hasPhone) { alert('Peserta belum punya no HP di profil.'); return; }
    if (!confirm(`Kirim reminder pembayaran ke ${inv.name}?\n${inv.milestone} · ${fmtRupiah(inv.amount)} · ${inv.trip}`)) return;
    setBusy('wa' + inv.id); setMsg('');
    start(async () => {
      const r = await sendPaymentReminder(inv.id);
      setBusy(null);
      if (r?.error) { alert('Gagal: ' + r.error); return; }
      setMsg(`Reminder terkirim ke ${inv.name} ✅`); load();
    });
  }

  function gantiDue(inv, newDue) {
    if (!newDue || newDue === inv.due_date) return;
    setBusy('due' + inv.id);
    start(async () => {
      const r = await updateInvoiceDueDate(inv.id, newDue);
      setBusy(null);
      if (r?.error) { alert('Gagal ubah due date: ' + r.error); return; }
      setMsg(`Due date ${inv.name} diperbarui ke ${fmtDate(newDue)} ✅`); load();
    });
  }

  const overdue = data?.overdue || [];
  const overduePax = data?.overduePax || [];
  const soon = data?.soonGroups || [];
  const pics = data?.pics || [];
  if (loading && !data) return <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-slate-500">Memuat reminder pembayaran…</div>;
  const kosong = overdue.length === 0 && soon.length === 0 && overduePax.length === 0;
  if (kosong && !pic && pics.length === 0) return null;

  const picChip = (nama) => nama
    ? <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 font-bold">PIC {nama}</span>
    : null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-bold text-slate-700">🔔 Reminder Pembayaran</h2>
        <div className="flex items-center gap-2">
          {data?.scoped ? (
            <span className="text-[11px] text-slate-500">Hanya trip kamu</span>
          ) : pics.length > 0 && (
            <select value={pic} onChange={(e) => pilihPic(e.target.value)}
              className="text-xs px-2 py-1 border border-slate-300 rounded-lg text-slate-700">
              <option value="">Semua PIC</option>
              {pics.map((p) => <option key={p} value={p}>PIC {p}</option>)}
            </select>
          )}
          <button onClick={() => load()} className="text-[11px] text-slate-400 hover:text-slate-600">↻ refresh</button>
        </div>
      </div>
      {msg && <div className="px-5 py-2 text-xs text-emerald-700 bg-emerald-50">{msg}</div>}
      {kosong && (
        <p className="px-5 py-6 text-center text-sm text-slate-400">
          Tidak ada tagihan jatuh tempo{pic ? ` untuk PIC ${pic}` : ''}.
        </p>
      )}

      {/* LEWAT DEADLINE — kirim WA ke peserta + ganti due date */}
      {overdue.length > 0 && (
        <div>
          <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-red-600">⚠ Lewat deadline — kirim reminder ke peserta ({overdue.length})</p>
          <div className="divide-y divide-slate-100">
            {overdue.map((inv) => (
              <div key={inv.id} className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{inv.name} <span className="text-slate-400 font-normal">· {inv.trip}</span>{picChip(inv.pic)}</p>
                  <p className="text-[11px] text-slate-500">
                    {inv.milestone} · {fmtRupiah(inv.amount)} · jatuh tempo {fmtDate(inv.due_date)} <span className="text-red-600 font-bold">· telat {inv.days} hari</span>
                    {inv.reminder_count > 0 && <span className="text-slate-400"> · diingatkan {inv.reminder_count}×</span>}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400">Ganti due date:</span>
                    <input type="date" defaultValue={inv.due_date} disabled={busy === 'due' + inv.id}
                      onChange={(e) => gantiDue(inv, e.target.value)}
                      className="text-[11px] px-1.5 py-0.5 border border-slate-300 rounded text-slate-600" />
                  </div>
                </div>
                <button type="button" onClick={() => kirim(inv)} disabled={busy === 'wa' + inv.id}
                  className="shrink-0 text-xs font-bold px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white disabled:opacity-50">
                  {busy === 'wa' + inv.id ? 'Mengirim…' : '📲 Kirim Reminder WA'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LEWAT DEADLINE dari JADWAL TRIP — peserta belum bayar termin yg sudah jatuh tempo */}
      {overduePax.length > 0 && (
        <div>
          <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-red-600">
            ⚠ Peserta lewat deadline termin ({overduePax.length})
          </p>
          <div className="divide-y divide-slate-100">
            {overduePax.slice(0, 50).map((p) => (
              <div key={p.key} className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{p.name} <span className="text-slate-400 font-normal">· {p.trip}</span>{picChip(p.pic)}</p>
                  <p className="text-[11px] text-slate-500">
                    {p.milestone}{p.amount > 0 ? ` · ${fmtRupiah(p.amount)}` : ''} · jatuh tempo {fmtDate(p.due_date)} <span className="text-red-600 font-bold">· telat {p.days} hari</span>
                    {!p.hasPhone && <span className="text-amber-600"> · belum ada no HP</span>}
                  </p>
                </div>
                <Link href={`/finance/payments/${p.tripId}`}
                  className="shrink-0 text-xs font-bold px-3 py-1.5 rounded bg-red-50 hover:bg-red-100 text-red-700">
                  Buka Payment Checklist →
                </Link>
              </div>
            ))}
          </div>
          {overduePax.length > 50 && (
            <p className="px-4 pb-3 text-[11px] text-slate-400">…dan {overduePax.length - 50} peserta lainnya.</p>
          )}
        </div>
      )}

      {/* H-7 — peringatan untuk FINANCE per group, kirim invoice ke peserta */}
      {soon.length > 0 && (
        <div>
          <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-amber-600">⏰ H-7 untuk Finance — harap kirim invoice ke peserta ({soon.length})</p>
          <div className="divide-y divide-slate-100">
            {soon.map((s, i) => (
              <div key={s.tripId + s.milestone + i} className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Group {s.kode} <span className="text-slate-400 font-normal">· {s.name}</span>{picChip(s.pic)}</p>
                  <p className="text-[11px] text-slate-500">
                    {s.milestone}{s.amount > 0 ? ` · ${fmtRupiah(s.amount)}` : ''} · jatuh tempo {fmtDate(s.due)} <span className="text-amber-600 font-semibold">· {s.days === 0 ? 'hari ini' : s.days + ' hari lagi'}</span>
                  </p>
                  <p className="text-[10px] text-amber-700 mt-0.5">→ Harap generate &amp; kirim invoice {s.milestone} ke peserta group ini.</p>
                </div>
                <Link href={`/finance/payments/${s.tripId}`}
                  className="shrink-0 text-xs font-bold px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-600 text-white">
                  Buka Payment Checklist →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
