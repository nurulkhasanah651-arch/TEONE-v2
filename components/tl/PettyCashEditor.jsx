'use client';

// Round 129: Petty Cash editor — Internal only
// Path: components/tl/PettyCashEditor.jsx

import { useState, useTransition } from 'react';
import { setPettyCashAmount } from '@/lib/actions/tlmanage';

function fmtRupiah(n) { return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); }
function parseNum(s) {
  if (s == null) return 0;
  return Number(String(s).replace(/[^0-9]/g, '')) || 0;
}
function formatNum(n) {
  if (!n) return '';
  return Number(n).toLocaleString('id-ID');
}

export default function PettyCashEditor({ tripId, current, canEdit = true, userEmail = '' }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState(current?.allocated_amount ? formatNum(current.allocated_amount) : '');
  const [notes, setNotes] = useState(current?.notes || '');
  const [error, setError] = useState('');

  const allocated = Number(current?.allocated_amount || 0);
  const spent = Number(current?.spent_amount || 0);
  const remaining = allocated - spent;
  const progress = allocated > 0 ? Math.round((spent / allocated) * 100) : 0;

  function handleSave() {
    setError('');
    const amt = parseNum(amount);
    if (amt < 0) { setError('Amount tidak boleh negatif'); return; }
    startTransition(async () => {
      const r = await setPettyCashAmount(tripId, amt, notes, userEmail);
      if (r?.error) setError(r.error);
      else setEditing(false);
    });
  }

  return (
    <div className="bg-white rounded-xl border-2 border-purple-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b bg-purple-50 border-purple-200 flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-purple-800 flex items-center gap-2">
          <span>💵</span> Petty Cash Trip
        </h2>
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs px-3 py-1 rounded bg-purple-500 hover:bg-purple-600 text-white font-bold"
          >
            ✎ Edit Nominal
          </button>
        )}
      </div>

      {editing ? (
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Nominal Petty Cash (IDR)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">Rp</span>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(formatNum(parseNum(e.target.value)))}
                placeholder="5.000.000"
                className="w-full pl-10 pr-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {[2000000, 5000000, 10000000, 20000000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmount(formatNum(v))}
                  className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                >
                  {fmtRupiah(v)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Catatan</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Contoh: Petty cash untuk operasional TL selama trip"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg resize-none"
            />
          </div>

          {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={pending}
              className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg disabled:opacity-50"
            >
              {pending ? 'Menyimpan...' : '💾 Simpan'}
            </button>
            <button
              onClick={() => { setEditing(false); setError(''); }}
              disabled={pending}
              className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50"
            >
              Batal
            </button>
          </div>
        </div>
      ) : (
        <div className="p-5">
          {allocated > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                  <p className="text-[10px] text-purple-700 font-bold uppercase tracking-wider">Allocated</p>
                  <p className="text-lg font-bold text-purple-700 mt-1">{fmtRupiah(allocated)}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                  <p className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">Spent</p>
                  <p className="text-lg font-bold text-amber-700 mt-1">{fmtRupiah(spent)}</p>
                </div>
                <div className={`rounded-lg p-3 border ${remaining >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${remaining >= 0 ? 'text-green-700' : 'text-red-700'}`}>Remaining</p>
                  <p className={`text-lg font-bold mt-1 ${remaining >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtRupiah(remaining)}</p>
                </div>
              </div>

              <div className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-600">Progress spent</span>
                  <span className="font-bold text-slate-700">{progress}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${progress > 90 ? 'bg-red-500' : progress > 70 ? 'bg-amber-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  />
                </div>
              </div>

              {current?.notes && (
                <p className="text-xs text-slate-600 italic">📝 {current.notes}</p>
              )}
              {current?.set_at && (
                <p className="text-[10px] text-slate-400 mt-1">
                  Set by {current.set_by || '—'} · {new Date(current.set_at).toLocaleString('id-ID')}
                </p>
              )}
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-3xl mb-2">💵</p>
              <p className="text-sm text-slate-600">Petty cash belum di-set untuk trip ini.</p>
              {canEdit && (
                <button
                  onClick={() => setEditing(true)}
                  className="mt-3 px-4 py-1.5 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg text-sm"
                >
                  + Set Petty Cash
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
