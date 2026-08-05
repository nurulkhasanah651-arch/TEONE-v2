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

// visa_result_photo_url bisa berupa URL publik lama ATAU path baru relatif bucket visa-results.
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
    // Paspor — sinkron dengan Passport AI: foto tersimpan di record CUSTOMER
    // (customers.passport_photo_url, URL publik bucket tl-uploads).
    // Fallback ke passport_upload_path di trip_passengers (upload via token).
    const passports = [];
    const passportPhoto = c.passport_photo_url || p.passport_photo_url;
    if (passportPhoto) passports.push({ label: 'Paspor', u: buildU(supaUrl, 'tl-uploads', passportPhoto) });
    else if (p.passport_upload_path) passports.push({ label: 'Paspor', u: buildU(supaUrl, 'passport-uploads', p.passport_upload_path) });
    if (Array.isArray(p.passport_extra_paths)) {
      p.passport_extra_paths.forEach((pp, i) => passports.push({ label: `Paspor hal.${i + 2}`, u: buildU(supaUrl, 'passport-uploads', pp) }));
    }
    const passportDocs = passports.filter((x) => x.u);
    // Visa approval (visa jadi) = file yang diupload staf di tab Visa → visa_result_photo_url
    // (path di bucket visa-results). Catatan: kolom visa_result hanya STATUS ('approved' dll).
    const vrp = visaResultPath(p.visa_result_photo_url);
    const visaApproval = vrp ? { label: 'Visa Approval', u: buildU(supaUrl, 'visa-results', vrp) } : null;
    const visaStatus = String(p.visa_result || '').toLowerCase() === 'approved' && !visaApproval ? 'approved (file belum diupload)' : '';

    const has = passportDocs.length || !!visaApproval;
    return {
      id: p.id, idx, name: c.name || `Peserta #${p.id}`,
      passportNo: c.passport_no || c.passport_number || p.passport_no || p.passport_number || '',
      passportDocs, visaApproval, visaStatus, has,
    };
  });

  const withDocs = rows.filter((r) => r.has);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
        <h2 className="font-bold text-brand-700">📄 Dokumen Peserta — Paspor &amp; Visa ({withDocs.length}/{rows.length})</h2>
        <p className="text-xs text-slate-500 mt-0.5">Paspor (dari Passport AI) &amp; visa approval (dari tab Visa). Klik untuk buka file.</p>
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
              <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                {r.passportDocs.map((d, i) => <DocChip key={`p${i}`} u={d.u} label={d.label} tone="brand" />)}
                {r.visaApproval && <DocChip u={r.visaApproval.u} label={r.visaApproval.label} tone="green" />}
                {r.passportDocs.length === 0 && <span className="text-[11px] text-slate-400">paspor belum ada</span>}
                {!r.visaApproval && <span className="text-[11px] text-slate-400">{r.visaStatus ? `visa ${r.visaStatus}` : 'visa approval belum ada'}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
