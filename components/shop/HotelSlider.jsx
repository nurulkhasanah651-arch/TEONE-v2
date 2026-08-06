'use client';

// Slider foto hotel (bisa beberapa foto, geser prev/next + dot). Path: components/shop/HotelSlider.jsx
import { useState } from 'react';

export default function HotelSlider({ images = [], alt = '' }) {
  const list = (images || []).filter(Boolean);
  const [i, setI] = useState(0);
  if (!list.length) return null;
  const cur = Math.min(i, list.length - 1);
  const go = (d) => setI((p) => (p + d + list.length) % list.length);
  return (
    <div className="relative h-48 bg-slate-100 overflow-hidden">
      {list.map((src, idx) => (
        <img key={idx} src={src} alt={alt} aria-hidden={idx !== cur}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${idx === cur ? 'opacity-100' : 'opacity-0'}`} />
      ))}
      {list.length > 1 && (
        <>
          <button type="button" onClick={() => go(-1)} aria-label="Sebelumnya"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/85 hover:bg-white text-slate-700 flex items-center justify-center shadow">‹</button>
          <button type="button" onClick={() => go(1)} aria-label="Berikutnya"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/85 hover:bg-white text-slate-700 flex items-center justify-center shadow">›</button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {list.map((_, idx) => (
              <button key={idx} type="button" onClick={() => setI(idx)} aria-label={`Foto ${idx + 1}`}
                className={`h-1.5 rounded-full transition-all ${idx === cur ? 'w-5 bg-white' : 'w-1.5 bg-white/60'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
