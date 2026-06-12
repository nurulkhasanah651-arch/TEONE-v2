'use client';
import { useState, useEffect } from 'react';

export default function HeroSlider({ images = [], interval = 5000 }) {
  const [i, setI] = useState(0);
  const list = images.length ? images : [''];
  useEffect(() => {
    if (list.length < 2) return;
    const t = setInterval(() => setI((p) => (p + 1) % list.length), interval);
    return () => clearInterval(t);
  }, [list.length, interval]);
  return (
    <div className="absolute inset-0">
      {list.map((src, idx) => (
        <img key={idx} src={src} alt="" aria-hidden={idx !== i}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${idx === i ? 'opacity-100' : 'opacity-0'}`} />
      ))}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-900/70 to-slate-900/30" />
      {list.length > 1 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {list.map((_, idx) => (
            <button key={idx} onClick={() => setI(idx)} aria-label={`Slide ${idx + 1}`}
              className={`h-2 rounded-full transition-all ${idx === i ? 'w-6 bg-white' : 'w-2 bg-white/50'}`} />
          ))}
        </div>
      )}
    </div>
  );
}
