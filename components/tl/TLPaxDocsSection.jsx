// Dokumen peserta untuk TL: paspor (dari upload paspor) + dokumen visa yang diupload
// & hasil visa (dari tab Visa). TL bisa lihat/buka langsung. File privat dibuka via /api/proof.
// Path: components/tl/TLPaxDocsSection.jsx
import SignedFileLink from '@/components/common/SignedFileLink';

// Bangun URL storage penuh → /api/proof (SignedFileLink) yang tanda-tangani ulang tiap dibuka.
function buildU(supaUrl, bucket, pathOrUrl) {
  if (!pathOrUrl) return null;
  const s = String(pathOrUrl).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s; // sudah URL penuh → proof route bisa parse
  const clean = s.replace(/^\/+/, '');
  if (!supaUrl) return null;
  return `${supaUrl}/storage/v1/object/authenticated/${bucket}/${clean}`;
}

// visa_result bisa berupa URL publik lama ATAU path baru relatif bucket visa-results.
function visaResultPath(stored) {
  if (!stored) return null;
  const s = String(stored);
  const marker = '/visa-results/';
  const i = s.indexOf(marker);
  if (i >= 0) return s.slice(i + marker.length).replace(/^\/+/, '');
  if (/^https?:\/\//i.test(s)) return null; // URL lain (bukan visa-results) → abaikan
  return s.replace(/^\/+/, '');
}

function DocChip({ u, label, tone = 'brand' }) {
  const cls = tone === 'green'
    ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
    : 'bg-brand-50 border-brand-300 text-brand-700 hover:bg-brand-100';
  return (
    <SignedFileLink url={u} className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded border ${cls}`}>
      📎 {label}
    </SignedFileLink>
  );
}

export default function TLPaxDocsSection({ passengers = [], customerMap = {}, supaUrl = '' }) {
  const rows = passengers.map((p, idx) => {
    const c = customerMap[p.customer_id] || {};
    // Paspor
    const passports = [];
    const pMain = p.passport_upload_path || p.passport_photo_url;
    if (pMain) passports.push({ label: 'Paspor', u: buildU(supaUrl, 'passport-uploads', pMain) });
    if (Array.isArray(p.passport_extra_paths)) {
      p.passport_extra_paths.forEach((pp, i) => passports.push({ label: `Paspor hal.${i + 2}`, u: buildU(supaUrl, 'passport-uploads', pp) }));
    }
    const passportDocs = passports.filter((x) => x.u);
    // Dokumen visa yang diupload peserta (tab Visa)
    const visaDocs = (Array.isArray(p.visa_uploaded_docs) ? p.visa_uploaded_docs : [])
      .map((d) => ({ label: d.doc_name || d.original_name || 'Dokumen Visa', u: buildU(supaUrl, 'visa-documents', d.file_path || d.file_url) }))
      .filter((x) => x.u);
    // Hasil visa (visa jadi)
    const vrp = visaResultPath(p.visa_result);
    const visaResult = vrp ? { label: 'Visa (hasil)', u: buildU(supaUrl, 'visa-results', vrp) } : null;

    const has = passportDocs.length || visaDocs.length || !!visaResult;
    return {
      id: p.id, idx, name: c.name || `Peserta #${p.id}`,
      passportNo: p.passport_no || p.passport_number || '',
      passportDocs, visaDocs, visaResult, has,
    };
  });

  const withDocs = rows.filter((r) => r.has);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
        <h2 className="font-bold text-brand-700">📄 Dokumen Peserta — Paspor &amp; Visa ({withDocs.length}/{rows.length})</h2>
        <p className="text-xs text-slate-500 mt-0.5">Paspor & dokumen/hasil visa yang sudah diupload. Klik untuk buka file.</p>
      </div>
      {withDocs.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500">Belum ada dokumen paspor / visa yang terupload.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {withDocs.map((r) => (
            <div key={r.id} className="px-5 py-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-slate-400">#{r.idx + 1}</span>
                <p className="font-semibold text-slate-800">{r.name}</p>
                {r.passportNo && <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">{r.passportNo}</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.passportDocs.map((d, i) => <DocChip key={`p${i}`} u={d.u} label={d.label} tone="brand" />)}
                {r.visaDocs.map((d, i) => <DocChip key={`v${i}`} u={d.u} label={d.label} tone="brand" />)}
                {r.visaResult && <DocChip u={r.visaResult.u} label={r.visaResult.label} tone="green" />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
