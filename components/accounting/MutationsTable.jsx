'use client';

// Round 92: Table mutasi bank dengan status + action manual match / unmatch / ignore

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { manualMatch, unmatch, markIgnored, deleteMutation } from '@/lib/actions/reconcile';

function fmtRupiah(n) {
  return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
}
function fmtDate(s) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return s; }
}

const STATUS_CFG = {
  unmatched: { label: '⚠ Unmatched', color: 'bg-amber-100 text-amber-800' },
  matched:   { label: '✓ Matched (auto)', color: 'bg-green-100 text-green-800' },
  manual:    { label: '✓ Matched (manual)', color: 'bg-blue-100 text-blue-800' },
  ignored:   { label: '➖ Ignored', color: 'bg-slate-100 text-slate-700' },
};

export default function MutationsTable({ mutations = [], financeItems = [] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState('all'); // all, unmatched, matched, ignored
  const [showMatchFor, setShowMatchFor] = useState(null);

  const safeMutations = Array.isArray(mutations) ? mutations : [];
  const safeItems = Array.isArray(financeItems) ? financeItems : [];

  const filtered = safeMutations.filter((m) => {
    if (filter === 'all') return true;
    if (filter === 'matched') return m.match_status === 'matched' || m.match_status === 'manual';
    return m.match_status === filter;
  });

  const stats = {
    total: safeMutations.length,
    matched: safeMutations.filter((m) => m.match_status === 'matched' || m.match_status === 'manual').length,
    unmatched: safeMutations.filter((m) => m.match_status === 'unmatched').length,
    ignored: safeMutations.filter((m) => m.match_status === 'ignored').length,
  };

  function handleUnmatch(id) {
    if (!confirm('Lepas match-nya?')) return;
    startTransition(async () => {
      await unmatch(id);
      router.refresh();
    });
  }

  function handleIgnore(id) {
    const note = prompt('Catatan kenapa di-ignore? (opsional)');
    startTransition(async () => {
      await markIgnored(id, note);
      router.refresh();
    });
  }

  function handleDelete(id) {
    if (!confirm('Hapus mutasi ini permanen?')) return;
    startTransition(async () => {
      await deleteMutation(id);
      router.refresh();
    });
  }

  function handleManualMatch(mutationId, financeItemId) {
    startTransition(async () => {
      await manualMatch(mutationId, financeItemId);
      setShowMatchFor(null);
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-brand-700">📊 Mutasi Bank ({stats.total})</h2>
        <div className="flex gap-2 text-xs">
          <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')}>Semua ({stats.total})</FilterBtn>
          <FilterBtn active={filter === 'unmatched'} onClick={() => setFilter('unmatched')}>⚠ Unmatched ({stats.unmatched})</FilterBtn>
          <FilterBtn active={filter === 'matched'} onClick={() => setFilter('matched')}>✓ Matched ({stats.matched})</FilterBtn>
          <FilterBtn active={filter === 'ignored'} onClick={() => setFilter('ignored')}>➖ Ignored ({stats.ignored})</FilterBtn>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">
          Tidak ada mutasi di filter ini.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="px-3 py-2">Tanggal</th>
                <th className="px-3 py-2">Keterangan</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-center">CR/DB</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((m) => {
                const status = STATUS_CFG[m.match_status] || STATUS_CFG.unmatched;
                return (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-xs">{fmtDate(m.tanggal)}</td>
                    <td className="px-3 py-2 text-xs max-w-md truncate">{m.keterangan}</td>
                    <td className={`px-3 py-2 text-right text-sm font-semibold ${m.type === 'cr' ? 'text-green-700' : 'text-red-700'}`}>
                      {fmtRupiah(m.amount)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${m.type === 'cr' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {m.type === 'cr' ? 'CR' : 'DB'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${status.color}`}>{status.label}</span>
                      {m.match_confidence && <span className="ml-1 text-[9px] text-slate-500">({m.match_confidence})</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex gap-1 flex-wrap">
                        {m.match_status === 'unmatched' && (
                          <button
                            type="button"
                            onClick={() => setShowMatchFor(m.id)}
                            className="px-2 py-0.5 text-[10px] font-semibold rounded bg-brand-100 hover:bg-brand-200 text-brand-700"
                          >
                            🔗 Match
                          </button>
                        )}
                        {(m.match_status === 'matched' || m.match_status === 'manual') && (
                          <button
                            type="button"
                            onClick={() => handleUnmatch(m.id)}
                            disabled={pending}
                            className="px-2 py-0.5 text-[10px] font-semibold rounded bg-amber-100 hover:bg-amber-200 text-amber-700"
                          >
                            ✕ Unmatch
                          </button>
                        )}
                        {m.match_status !== 'ignored' && (
                          <button
                            type="button"
                            onClick={() => handleIgnore(m.id)}
                            disabled={pending}
                            className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                          >
                            ➖ Ignore
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(m.id)}
                          disabled={pending}
                          className="px-2 py-0.5 text-[10px] font-semibold rounded bg-red-50 hover:bg-red-100 text-red-700"
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Manual match modal */}
      {showMatchFor && (
        <ManualMatchModal
          mutation={safeMutations.find((m) => m.id === showMatchFor)}
          items={safeItems}
          onMatch={handleManualMatch}
          onClose={() => setShowMatchFor(null)}
        />
      )}
    </div>
  );
}

function FilterBtn({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${active ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
    >
      {children}
    </button>
  );
}

function ManualMatchModal({ mutation, items, onMatch, onClose }) {
  const isCredit = mutation?.type === 'cr';
  // Filter candidates: income kalau CR, hpp kalau DB
  const candidates = items.filter((it) => isCredit ? it.item_type === 'income' : it.item_type === 'hpp');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-brand-700">
            🔗 Match Mutasi {mutation?.type === 'cr' ? 'CR' : 'DB'} {fmtRupiah(mutation?.amount)}
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">✕</button>
        </div>
        <div className="p-4 overflow-y-auto">
          <p className="text-xs text-slate-600 mb-3">{mutation?.keterangan}</p>
          <p className="text-xs font-bold text-slate-700 mb-2">Pilih {isCredit ? 'Income Item' : 'HPP Item'} yang cocok:</p>
          {candidates.length === 0 ? (
            <p className="text-sm text-slate-500 italic">
              Tidak ada {isCredit ? 'income' : 'HPP'} item di sistem. Buat dulu di /finance/cashflow/[trip].
            </p>
          ) : (
            <div className="space-y-1.5">
              {candidates.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onMatch(mutation.id, it.id)}
                  className="w-full text-left p-2 hover:bg-slate-50 border border-slate-200 rounded text-xs"
                >
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-800">{it.category} — {it.component}</p>
                      <p className="text-[10px] text-slate-500">{it.vendor_name || '—'} · Trip {it.trip_id}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-brand-700">{fmtRupiah(it.total_amount)}</p>
                      {it.dp_paid > 0 && <p className="text-[10px] text-green-600">DP: {fmtRupiah(it.dp_paid)}</p>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
