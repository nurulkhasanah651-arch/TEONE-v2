'use client';

// Round 132: Final Report — Google Review UPLOAD LANGSUNG (screenshot/file)
// Documentation Trip TETAP LINK (Google Drive folder foto/video)
// Path: components/tl/FinalReportForm.jsx

import { useState, useTransition } from 'react';
import { saveFinalReport, reviewReportByOps } from '@/lib/actions/tlreport';
import FileUploadInput from './FileUploadInput';

function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}

export default function FinalReportForm({
  brand,
  tripId, report, canEdit = true, canReview = false, userEmail = '',
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(!report?.submitted);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // documentation_link tetap LINK (folder Google Drive berisi banyak foto/video)
  const [documentationLink, setDocumentationLink] = useState(report?.documentation_link || '');
  // review_upload_link → ganti jadi FILE UPLOAD (screenshot review internal)
  const [reviewUploadFile, setReviewUploadFile] = useState(report?.review_upload_link || '');
  // google_review_link → ganti jadi FILE UPLOAD (screenshot Google Review)
  const [googleReviewFile, setGoogleReviewFile] = useState(report?.google_review_link || '');
  const [overallRating, setOverallRating] = useState(report?.overall_rating || 5);
  const [highlights, setHighlights] = useState(report?.highlights || '');
  const [issuesEncountered, setIssuesEncountered] = useState(report?.issues_encountered || '');
  const [suggestions, setSuggestions] = useState(report?.suggestions || '');
  const [opsNotes, setOpsNotes] = useState(report?.ops_notes || '');

  function handleSave(submit = false) {
    setError(''); setMsg('');
    if (submit) {
      if (!documentationLink && !reviewUploadFile && !googleReviewFile) {
        if (!confirm('Belum ada link dokumentasi/review/Google Review. Tetap submit?')) return;
      }
    }
    startTransition(async () => {
      const r = await saveFinalReport({
        brand,
        tripId,
        documentationLink: documentationLink.trim(),
        reviewUploadLink: reviewUploadFile,
        googleReviewLink: googleReviewFile,
        overallRating,
        highlights: highlights.trim(),
        issuesEncountered: issuesEncountered.trim(),
        suggestions: suggestions.trim(),
        submitted: submit,
        userEmail,
      });
      if (r?.error) { setError(r.error); return; }
      setMsg(submit ? '✓ Final report submitted' : '✓ Draft tersimpan');
      if (submit) setEditing(false);
    });
  }

  function handleReview() {
    if (!confirm('Mark report as reviewed by Ops?')) return;
    setError(''); setMsg('');
    startTransition(async () => {
      const r = await reviewReportByOps(tripId, opsNotes, userEmail);
      if (r?.error) setError(r.error);
      else setMsg('✓ Report reviewed by Ops');
    });
  }

  return (
    <div className="bg-white rounded-xl border-2 border-pink-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b bg-pink-50 border-pink-200 flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-pink-800 flex items-center gap-2">
          <span>📊</span> Final Report After Trip
        </h2>
        <div className="flex items-center gap-2">
          {report?.submitted && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
              ✓ Submitted {fmtDate(report.submitted_at)}
            </span>
          )}
          {report?.reviewed_by_ops && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-800">
              ✓ Reviewed by Ops
            </span>
          )}
          {report?.submitted && canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs px-2 py-1 rounded bg-pink-500 hover:bg-pink-600 text-white font-bold"
            >
              ✎ Edit
            </button>
          )}
        </div>
      </div>

      {msg && <div className="px-5 py-2 bg-green-50 border-b border-green-200 text-xs text-green-800">{msg}</div>}
      {error && <div className="px-5 py-2 bg-red-50 border-b border-red-200 text-xs text-red-800">⚠ {error}</div>}

      <div className="p-5 space-y-4">
        {editing ? (
          <>
            <Field label="⭐ Overall Trip Rating">
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setOverallRating(star)}
                    className={`text-3xl transition-transform hover:scale-110 ${overallRating >= star ? '' : 'opacity-30 grayscale'}`}
                  >
                    ⭐
                  </button>
                ))}
                <span className="ml-2 text-sm font-bold text-slate-700">{overallRating}/5</span>
              </div>
            </Field>

            {/* DOKUMENTASI TRIP — TETAP LINK (folder Google Drive berisi foto/video banyak) */}
            <div className="p-4 bg-purple-50 border-2 border-purple-200 rounded-lg">
              <Field label="📸 Link Dokumentasi Trip (folder Google Drive foto/video)">
                <input autoComplete="off"
                  type="url"
                  value={documentationLink}
                  onChange={(e) => setDocumentationLink(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className={`${inputCls} bg-white`}
                />
              </Field>
              <p className="text-[11px] text-purple-700 mt-2">
                💡 Folder Google Drive berisi banyak foto/video trip. Set "Anyone with link can view".
              </p>
            </div>

            {/* REVIEW INTERNAL — UPLOAD LANGSUNG */}
            <div className="p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
              <FileUploadInput
                tripId={tripId}
                subfolder="review-internal"
                value={reviewUploadFile}
                onChange={setReviewUploadFile}
                label="📝 Upload Review/Testimonial Internal (foto/PDF/Excel)"
                maxSizeMB={20}
              />
              <p className="text-[11px] text-blue-700 mt-2">
                💡 Screenshot Google Form responses, kompilasi testimonial peserta, atau file PDF/Excel feedback.
              </p>
            </div>

            {/* GOOGLE REVIEW — UPLOAD LANGSUNG */}
            <div className="p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
              <FileUploadInput
                tripId={tripId}
                subfolder="google-review"
                value={googleReviewFile}
                onChange={setGoogleReviewFile}
                label="⭐ Upload Bukti Google Review (screenshot/foto)"
                maxSizeMB={20}
              />
              <p className="text-[11px] text-yellow-800 mt-2">
                💡 Screenshot review Google Maps yang dikasih peserta, atau foto/PDF bukti review.
                <br />Boleh upload beberapa kali (file terakhir yang tersimpan).
              </p>
            </div>

            <Field label="✨ Highlights / Hal Positif">
              <textarea autoComplete="off"
                value={highlights}
                onChange={(e) => setHighlights(e.target.value)}
                rows={3}
                placeholder="Yang berjalan baik selama trip..."
                className={`${inputCls} resize-none`}
              />
            </Field>

            <Field label="⚠ Issues / Masalah Yang Dihadapi">
              <textarea autoComplete="off"
                value={issuesEncountered}
                onChange={(e) => setIssuesEncountered(e.target.value)}
                rows={3}
                placeholder="Masalah teknis/peserta/vendor selama trip..."
                className={`${inputCls} resize-none`}
              />
            </Field>

            <Field label="💡 Saran / Improvement untuk Trip Depan">
              <textarea autoComplete="off"
                value={suggestions}
                onChange={(e) => setSuggestions(e.target.value)}
                rows={3}
                placeholder="Hal yang bisa diperbaiki untuk trip selanjutnya..."
                className={`${inputCls} resize-none`}
              />
            </Field>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => handleSave(false)}
                disabled={pending}
                className="flex-1 py-2 border-2 border-pink-300 text-pink-700 font-bold rounded-lg hover:bg-pink-50 disabled:opacity-50"
              >
                💾 Save Draft
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={pending}
                className="flex-1 py-2 bg-pink-500 hover:bg-pink-600 text-white font-bold rounded-lg disabled:opacity-50"
              >
                {pending ? 'Submitting...' : '📨 Submit Final Report'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <p className="text-xs font-bold text-slate-600 uppercase">Rating:</p>
              <p className="text-2xl">{[1,2,3,4,5].map((s) => report?.overall_rating >= s ? '⭐' : '☆').join('')}</p>
              <span className="text-sm font-bold">{report?.overall_rating}/5</span>
            </div>

            {report?.documentation_link && (
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-xs font-bold text-purple-800 uppercase tracking-wider mb-1">📸 Dokumentasi Trip</p>
                <a href={report.documentation_link} target="_blank" rel="noreferrer" className="text-sm text-purple-700 hover:underline break-all font-semibold">
                  {report.documentation_link}
                </a>
              </div>
            )}

            {report?.review_upload_link && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-1">📝 Review/Testimonial Internal</p>
                <a href={report.review_upload_link} target="_blank" rel="noreferrer" className="text-sm text-blue-700 hover:underline break-all font-semibold">
                  📎 Lihat file
                </a>
              </div>
            )}

            {report?.google_review_link && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-xs font-bold text-yellow-800 uppercase tracking-wider mb-1">⭐ Bukti Google Review</p>
                <a href={report.google_review_link} target="_blank" rel="noreferrer" className="text-sm text-yellow-700 hover:underline break-all font-semibold">
                  📎 Lihat bukti
                </a>
              </div>
            )}

            {report?.highlights && <ViewBlock title="✨ Highlights" content={report.highlights} color="green" />}
            {report?.issues_encountered && <ViewBlock title="⚠ Issues" content={report.issues_encountered} color="amber" />}
            {report?.suggestions && <ViewBlock title="💡 Saran" content={report.suggestions} color="blue" />}

            {canReview && report?.submitted && (
              <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">🧑‍💼 Ops Review</p>
                <textarea autoComplete="off"
                  value={opsNotes}
                  onChange={(e) => setOpsNotes(e.target.value)}
                  rows={2}
                  placeholder="Catatan dari Ops untuk follow-up..."
                  className={`${inputCls} resize-none mb-2`}
                />
                <button
                  onClick={handleReview}
                  disabled={pending || report?.reviewed_by_ops}
                  className="px-4 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded disabled:opacity-50"
                >
                  {report?.reviewed_by_ops ? `✓ Reviewed by ${report.reviewed_by}` : '✓ Mark as Reviewed'}
                </button>
              </div>
            )}
            {report?.ops_notes && !canReview && (
              <ViewBlock title="🧑‍💼 Ops Notes" content={report.ops_notes} color="slate" />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-slate-700 block mb-1">{label}</span>
      {children}
    </label>
  );
}

function ViewBlock({ title, content, color }) {
  const bg = { green: 'bg-green-50 border-green-200 text-green-900', amber: 'bg-amber-50 border-amber-200 text-amber-900', blue: 'bg-blue-50 border-blue-200 text-blue-900', slate: 'bg-slate-50 border-slate-200 text-slate-800' }[color] || '';
  return (
    <div className={`p-3 rounded-lg border ${bg}`}>
      <p className="text-xs font-bold uppercase tracking-wider mb-1">{title}</p>
      <p className="text-sm whitespace-pre-wrap">{content}</p>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-1 focus:ring-pink-500 outline-none bg-white';
