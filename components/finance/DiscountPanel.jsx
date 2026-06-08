'use client';

// R211 v2: Panel edit diskon per peserta
// Diskon hanya kurangi expected & income projection (gak masuk Cash Out)

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateDiscount } from '@/lib/actions/discount';

function fmtRupiah(n) { return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); }
function fmtInput(v) {
  if (v === '' || v == null) return '';
  const n = String(v).replace(/[^0-9]/g, '');
  if (!n) return '';
  return Number(n).toLocaleString('id-ID');
}
function parseInput(s) { if (s == null) return ''; return String(s).replace(/[^0-9]/g, ''); }

export default function DiscountPanel({ passenger, customerName }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(String(passenger?.discount_amount || ''));
  const [result, setResult] = useState(null);

  const currentDiscount = Number(passenger?.discount_amount) || 0;
  const draftNum = parseInt(draft) || 0;
  const hasChange = draftNum !== currentDiscount;

  async function handleSave() {
    setResult(null);
    startTransition(async () => {
      const r = await updateDiscount(passenger.id, draftNum);
      if (r?.error) setResult({ error: r.error });
      else {
        setResult({ ok: `✓ Diskon ${fmtRupiah(draftNum)} disimpan — Income projection & margin auto-update` });
        router.refresh();
      }
    });
  }

  async function handleClear() {
    if (!confirm('Hapus diskon peserta ini?')) return;
    setDraft('');
    setResult(null);
    startTransition(async () => {
      const r = await updateDiscount(passenger.id, 0);
      if (r?.error) setResult({ error: r.error });
      else {
        setResult({ ok: '✓ Diskon dihapus — Total tagihan balik ke harga full' });
        router.refresh();
      }
    });
  }

  return (
    <div className="bg-amber-50/40 border border-amber-200 rounded-lg p-3 mt-3">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <p className="text-xs font-bold text-amber-800">
          🎟 Diskon Peserta
          {currentDiscount > 0 && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 font-bold">
              -{fmtRupiah(currentDiscount)}
            </span>
          )}
        </p>
        <p className="text-[10px] text-slate-500">
          Kurangi expected total · Income projection & margin otomatis turun
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input autoComplete="off"
          type="text"
          inputMode="numeric"
          value={fmtInput(draft)}
          onChange={(e) => setDraft(parseInput(e.target.value))}
          placeholder="0"
          className="flex-1 px-3 py-1.5 border border-amber-300 rounded text-sm bg-white"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !hasChange}
          className="px-3 py-1.5 text-xs font-bold rounded bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50"
        >
          {pending ? '...' : '💾 Simpan'}
        </button>
        {currentDiscount > 0 && (
          <button
            type="button"
            onClick={handleClear}
            disabled={pending}
            className="px-2 py-1.5 text-xs font-semibold rounded bg-red-50 hover:bg-red-100 text-red-700"
          >
            ✕ Hapus
          </button>
        )}
      </div>

      {hasChange && (
        <p className="text-[10px] text-amber-700 mt-1">
          {draftNum > currentDiscount
            ? `Naikin diskon dari ${fmtRupiah(currentDiscount)} ke ${fmtRupiah(draftNum)}`
            : draftNum < currentDiscount
            ? `Turunin diskon dari ${fmtRupiah(currentDiscount)} ke ${fmtRupiah(draftNum)}`
            : ''}
        </p>
      )}

      <p className="text-[10px] text-slate-500 mt-1 italic">
        ℹ Diskon dikasih di awal (gak ada bayaran) — jadi gak masuk Cash Out.
        Otomatis kurangi tagihan peserta + proyeksi income trip.
      </p>

      {result?.ok && (
        <p className="text-[10px] text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1 mt-2">
          {result.ok}
        </p>
      )}
      {result?.error && (
        <p className="text-[10px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mt-2">
          ❌ {result.error}
        </p>
      )}
    </div>
  );
}
