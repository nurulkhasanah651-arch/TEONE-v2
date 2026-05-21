'use client';

import { useState } from 'react';

// TL Picker — dropdown dari master + fallback manual input
// Submits 2 fields: tl_id (dari master, optional) + tl_name (selalu ada)
export default function TLPicker({ tourLeaders = [], initialTlId, initialTlName }) {
  const [mode, setMode] = useState(initialTlId ? 'master' : (initialTlName ? 'manual' : 'master'));
  const [selectedId, setSelectedId] = useState(initialTlId || '');
  const [manualName, setManualName] = useState(initialTlName || '');

  const activeList = tourLeaders.filter((t) => t.active !== false);

  function handlePick(id) {
    setSelectedId(id);
    if (id) {
      const tl = activeList.find((t) => String(t.id) === String(id));
      if (tl) setManualName(tl.name); // sync nama buat kompat
    }
  }

  return (
    <div className="space-y-2">
      {/* Mode toggle */}
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setMode('master')}
          className={`px-3 py-1 rounded font-semibold ${mode === 'master' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
        >
          📋 Pilih dari Master TL ({activeList.length})
        </button>
        <button
          type="button"
          onClick={() => { setMode('manual'); setSelectedId(''); }}
          className={`px-3 py-1 rounded font-semibold ${mode === 'manual' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
        >
          ✍ Input Manual
        </button>
      </div>

      {mode === 'master' ? (
        <select
          value={selectedId}
          onChange={(e) => handlePick(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
        >
          <option value="">— Pilih TL dari master —</option>
          {activeList.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.type === 'inhouse' ? 'Inhouse' : 'Freelance'}){t.phone ? ` · ${t.phone}` : ''}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
          placeholder="Ketik nama TL manual..."
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
        />
      )}

      {/* Hidden inputs untuk form submission */}
      <input type="hidden" name="tl_id" value={mode === 'master' ? selectedId : ''} />
      <input type="hidden" name="tl_name" value={mode === 'master'
        ? (activeList.find((t) => String(t.id) === String(selectedId))?.name || '')
        : manualName}
      />

      {activeList.length === 0 && mode === 'master' && (
        <p className="text-[11px] text-amber-700">
          Belum ada TL di master.{' '}
          <a href="/tl-master" target="_blank" className="font-semibold underline">Tambahkan di Master TL →</a>
        </p>
      )}
    </div>
  );
}
