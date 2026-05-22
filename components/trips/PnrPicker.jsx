'use client';

// Round 72: PnrPicker — pilih dari PNR Inventory atau input manual
// Saat pilih dari inventory, auto-fill route juga

import { useState } from 'react';

export default function PnrPicker({ pnrInventory = [], initialPnr = '', initialRoute = '' }) {
  const inv = Array.isArray(pnrInventory) ? pnrInventory : [];
  const [pnr, setPnr] = useState(initialPnr || '');
  const [route, setRoute] = useState(initialRoute || '');
  // Mode: 'picker' = pilih dari inventory, 'manual' = input bebas
  const initialMode = initialPnr && !inv.find((p) => p.pnr === initialPnr) ? 'manual' : 'picker';
  const [mode, setMode] = useState(initialMode);

  function handleSelectInventory(e) {
    const val = e.target.value;
    if (!val) {
      setPnr('');
      setRoute('');
      return;
    }
    try {
      const item = JSON.parse(val);
      setPnr(item.pnr || '');
      // route disimpan sebagai array 'routes' di flight_inventory, ambil yang pertama
      const r = Array.isArray(item.routes) ? item.routes.join(' / ') : (item.route || '');
      setRoute(r);
    } catch {
      // ignore parse error
    }
  }

  return (
    <div className="space-y-2">
      {/* Mode toggle */}
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setMode('picker')}
          className={`px-3 py-1 rounded font-semibold ${mode === 'picker' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
        >
          📋 Pilih dari Inventory
        </button>
        <button
          type="button"
          onClick={() => setMode('manual')}
          className={`px-3 py-1 rounded font-semibold ${mode === 'manual' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
        >
          ✎ Input Manual
        </button>
      </div>

      {/* Picker mode */}
      {mode === 'picker' && (
        <div>
          {inv.length === 0 ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
              ⚠ PNR Inventory masih kosong. Tambah dulu di Finance → PNR Inventory, atau switch ke "Input Manual".
            </div>
          ) : (
            <select
              onChange={handleSelectInventory}
              value={inv.find((p) => p.pnr === pnr) ? JSON.stringify(inv.find((p) => p.pnr === pnr)) : ''}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-500 outline-none"
            >
              <option value="">— Pilih PNR dari Inventory —</option>
              {inv.map((p) => {
                const r = Array.isArray(p.routes) ? p.routes.join(' / ') : (p.route || '');
                return (
                  <option key={p.id} value={JSON.stringify(p)}>
                    {p.pnr} {r ? `· ${r}` : ''} {p.vendor ? `(${p.vendor})` : ''}
                  </option>
                );
              })}
            </select>
          )}
        </div>
      )}

      {/* Manual mode */}
      {mode === 'manual' && (
        <input
          type="text"
          value={pnr}
          onChange={(e) => setPnr(e.target.value.toUpperCase())}
          placeholder="Ketik kode PNR manual (e.g. ABC123)"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-500 outline-none uppercase"
        />
      )}

      {/* Route — selalu visible, bisa di-override */}
      <div>
        <span className="text-[11px] font-semibold text-slate-600 block mb-0.5">Route (auto dari inventory, bisa edit)</span>
        <input
          type="text"
          value={route}
          onChange={(e) => setRoute(e.target.value)}
          placeholder="Misal: CGK-DOH-CDG / VCE-DOH-CGK"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-500 outline-none"
        />
      </div>

      {/* Hidden inputs untuk form submit */}
      <input type="hidden" name="pnr" value={pnr} />
      <input type="hidden" name="route" value={route} />
    </div>
  );
}
