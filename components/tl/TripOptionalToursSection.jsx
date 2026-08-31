// Portal TL — daftar Optional Tour + siapa yang ikut (read-only). Komponen presentasional.
export default function TripOptionalToursSection({ optionalTours = [] }) {
  if (!Array.isArray(optionalTours) || !optionalTours.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-bold text-slate-800 mb-1">🎟 Optional Tour</h2>
      <p className="text-[11px] text-slate-500 mb-3">Peserta yang ikut optional tour untuk grup ini (read-only).</p>
      <div className="space-y-3">
        {optionalTours.map((o) => (
          <div key={o.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-semibold text-slate-800 text-sm">{o.name}</span>
              <span className="text-[11px] font-bold text-brand-600 shrink-0">{(o.members || []).length} ikut</span>
            </div>
            {(o.members || []).length ? (
              <ol className="list-decimal list-inside text-sm text-slate-700 space-y-0.5">
                {o.members.map((m, i) => (<li key={i}>{m}</li>))}
              </ol>
            ) : (
              <p className="text-xs text-slate-400 italic">Belum ada peserta yang ikut.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
