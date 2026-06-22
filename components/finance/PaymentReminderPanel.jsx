'use client';

import { useEffect, useState, useTransition } from 'react';
import { getPaymentDeadlineAlerts, sendPaymentReminder } from '@/lib/actions/payment-reminders';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';

export default function PaymentReminderPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [, start] = useTransition();
  const [msg, setMsg] = useState('');

  async function load() {
    setLoading(true);
    const r = await getPaymentDeadlineAlerts();
    setLoading(false);
    if (!r?.error) setData(r);
  }
  useEffect(() => { load(); }, []);

  function kirim(inv) {
    if (!inv.hasPhone) { alert('Peserta belum punya no HP di profil.'); return; }
    if (!confirm(`Kirim reminder pembayaran ke ${inv.name}?\n${inv.milestone} · ${fmtRupiah(inv.amount)} · ${inv.trip}`)) return;
    setBusy(inv.id); setMsg('');
    start(async () => {
      const r = await sendPaymentReminder(inv.id);
      setBusy(null);
      if (r?.error) { alert('Gagal: ' + r.error); return; }
      setMsg(`Reminder terkirim ke ${inv.name} ✅`);
      load();
    });
  }

  const overdue = data?.overdue || [];
  const soon = data?.soon || [];
  if (loading) return <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-slate-500">Memuat reminder pembayaran…</div>;
  if (overdue.length === 0 && soon.length === 0) return null;

  const Row = ({ inv, late }) => (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 flex-wrap">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{inv.name} <span className="text-slate-400 font-normal">· {inv.trip}</span></p>
        <p className="text-[11px] text-slate-500">
          {inv.milestone} · {fmtRupiah(inv.amount)} · jatuh tempo {fmtDate(inv.due_date)}
          {late ? <span className="text-red-600 font-bold"> · telat {inv.days} hari</span> : <span className="text-amber-600 font-semibold"> · {inv.days} hari lagi</span>}
          {inv.reminder_count > 0 && <span className="text-slate-400"> · diingatkan {inv.reminder_count}×</span>}
        </p>
      </div>
      <button type="button" onClick={() => kirim(inv)} disabled={busy === inv.id}
        className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded ${late ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'} text-white disabled:opacity-50`}>
        {busy === inv.id ? 'Mengirim…' : '📲 Kirim Reminder WA'}
      </button>
    </div>
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <h2 className="font-bold text-slate-700">🔔 Reminder Pembayaran</h2>
        <button onClick={load} className="text-[11px] text-slate-400 hover:text-slate-600">↻ refresh</button>
      </div>
      {msg && <div className="px-5 py-2 text-xs text-emerald-700 bg-emerald-50">{msg}</div>}
      {overdue.length > 0 && (
        <div>
          <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-red-600">⚠ Lewat deadline ({overdue.length})</p>
          <div className="divide-y divide-slate-100">{overdue.map((inv) => <Row key={inv.id} inv={inv} late />)}</div>
        </div>
      )}
      {soon.length > 0 && (
        <div>
          <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-amber-600">⏰ Mendekati deadline / H-7 ({soon.length})</p>
          <div className="divide-y divide-slate-100">{soon.map((inv) => <Row key={inv.id} inv={inv} />)}</div>
        </div>
      )}
    </div>
  );
}
