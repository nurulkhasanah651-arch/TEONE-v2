// Insights WhatsApp — tampilan analitik (presentational). Data dari getInsights.
function fmtDur(sec) {
  if (sec == null || isNaN(sec)) return '—';
  const s = Math.round(sec);
  if (s < 60) return s + ' dtk';
  if (s < 3600) return Math.round(s / 60) + ' mnt';
  if (s < 86400) return (s / 3600).toFixed(1) + ' jam';
  return (s / 86400).toFixed(1) + ' hari';
}
function Card({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-bold text-slate-500 uppercase">{label}</p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

export default function InsightsClient({ data }) {
  const { agents = [], daily = [], source = {}, avgCloseSec, perTrip = [], pipeline = {}, totals = {} } = data || {};
  const replyRate = totals.totalLeads ? Math.round((agents.reduce((s, a) => s + a.replied, 0) / totals.totalLeads) * 100) : 0;

  return (
    <div className="p-4 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Insights WhatsApp</h1>
        <p className="text-sm text-slate-500">Performa agent, leads harian, sumber lead, dan waktu closing. Khusus owner/manager/accounting.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Total Leads" value={totals.totalLeads ?? 0} sub={`${replyRate}% terbalas`} />
        <Card label="Closing" value={totals.totalClosed ?? 0} sub={totals.totalLeads ? `${Math.round((totals.totalClosed / totals.totalLeads) * 100)}% konversi` : ''} />
        <Card label="Dari Ads" value={source.ads ?? 0} sub={`Reguler: ${source.regular ?? 0}`} />
        <Card label="Rata2 waktu closing" value={fmtDur(avgCloseSec)} sub="Chat pertama → closing" />
      </div>

      {/* Performa agent */}
      <div>
        <h2 className="text-sm font-bold text-slate-700 mb-2">Performa Agent (PIC & CS)</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase">
              <tr><th className="text-left px-3 py-2">Agent</th><th className="text-left px-2">Peran</th><th className="text-right px-2">Percakapan</th><th className="text-right px-2">Terbalas</th><th className="text-right px-2">Rata2 balas</th><th className="text-right px-3">Closing</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {agents.length === 0 && <tr><td colSpan="6" className="px-3 py-3 text-center text-slate-400 text-xs">Belum ada data.</td></tr>}
              {agents.map((a, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 font-semibold text-slate-800">{a.name}</td>
                  <td className="px-2 uppercase text-[11px] text-slate-500">{a.role}</td>
                  <td className="px-2 text-right">{a.convs}</td>
                  <td className="px-2 text-right">{a.replied}</td>
                  <td className="px-2 text-right">{fmtDur(a.avgRespSec)}</td>
                  <td className="px-3 text-right font-semibold text-emerald-600">{a.closed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leads harian */}
      <div>
        <h2 className="text-sm font-bold text-slate-700 mb-2">Leads Harian (14 hari) — termasuk khusus nomor CS & sumber ads</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase">
              <tr><th className="text-left px-3 py-2">Tanggal</th><th className="text-right px-2">Masuk</th><th className="text-right px-2">Terbalas</th><th className="text-right px-2">CS masuk</th><th className="text-right px-2">CS terbalas</th><th className="text-right px-2">Ads</th><th className="text-right px-3">Reguler</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {daily.length === 0 && <tr><td colSpan="7" className="px-3 py-3 text-center text-slate-400 text-xs">Belum ada data.</td></tr>}
              {daily.map((d) => (
                <tr key={d.date}>
                  <td className="px-3 py-2 text-slate-700">{d.date}</td>
                  <td className="px-2 text-right font-semibold">{d.total}</td>
                  <td className="px-2 text-right">{d.replied}</td>
                  <td className="px-2 text-right">{d.cs}</td>
                  <td className="px-2 text-right">{d.csReplied}</td>
                  <td className="px-2 text-right text-purple-600 font-semibold">{d.ads}</td>
                  <td className="px-3 text-right">{d.regular}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Time-to-close per trip */}
      <div>
        <h2 className="text-sm font-bold text-slate-700 mb-2">Waktu Closing per Trip</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase">
              <tr><th className="text-left px-3 py-2">Trip</th><th className="text-right px-2">Jml closing</th><th className="text-right px-3">Rata2 lama closing</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {perTrip.length === 0 && <tr><td colSpan="3" className="px-3 py-3 text-center text-slate-400 text-xs">Belum ada closing bertanda trip.</td></tr>}
              {perTrip.map((t, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-slate-700">{t.trip}</td>
                  <td className="px-2 text-right font-semibold">{t.count}</td>
                  <td className="px-3 text-right">{fmtDur(t.avgSec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pipeline */}
      <div>
        <h2 className="text-sm font-bold text-slate-700 mb-2">Distribusi Pipeline</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(pipeline).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"><span className="text-slate-500">{k}:</span> <span className="font-bold text-slate-800">{v}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}
