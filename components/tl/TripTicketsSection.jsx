// Portal TL — dokumen resmi per grup (trip): Tour Confirmation (buka & print PDF)
// + E-Ticket dari PNR Inventory (unduh). Komponen presentasional (server-friendly).
export default function TripTicketsSection({ tripId, brandCode, tcUrl, groupName, etickets = [] }) {
  const hasTC = !!tcUrl;
  const rows = [];
  (Array.isArray(etickets) ? etickets : []).forEach((p) => {
    (Array.isArray(p.eticket_docs) ? p.eticket_docs : []).forEach((d, i) => {
      if (d && (d.name || d.path)) rows.push({ p, d, key: `${p.id}:${i}` });
    });
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-bold text-slate-800 mb-1">🎫 Tour Confirmation &amp; E-Ticket</h2>
      <p className="text-[11px] text-slate-500 mb-3">Dokumen resmi trip untuk grup ini — klik untuk buka/unduh.</p>

      {/* Tour Confirmation */}
      <div className="mb-4">
        <div className="text-[10px] font-bold text-slate-600 uppercase mb-1">Tour Confirmation</div>
        {hasTC ? (
          <a
            href={tcUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
          >
            📄 Buka Tour Confirmation{groupName ? ` — ${groupName}` : ''} (print → PDF)
          </a>
        ) : (
          <p className="text-xs text-slate-400 italic">Belum dibuat oleh tim operasional.</p>
        )}
      </div>

      {/* E-Ticket */}
      <div>
        <div className="text-[10px] font-bold text-slate-600 uppercase mb-1">E-Ticket (PNR Inventory)</div>
        {rows.length ? (
          <div className="space-y-2">
            {rows.map(({ p, d, key }) => (
              <a
                key={key}
                href={`/api/tl-eticket/${tripId}/${p.id}/${encodeURIComponent(d.name || 'eticket')}?brand=${brandCode}`}
                download={d.name || 'eticket'}
                className="flex items-center justify-between gap-3 p-2 rounded bg-slate-50 hover:bg-slate-100"
              >
                <span className="text-sm text-slate-700 truncate">📎 {d.name || 'E-Ticket'}</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase shrink-0">
                  {(p.airline || p.pnr || '') + (p.ticket_type ? ` · ${p.ticket_type}` : '')}
                </span>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">Belum ada e-ticket di-upload di PNR Inventory.</p>
        )}
      </div>
    </div>
  );
}
