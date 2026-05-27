'use client';

// Round 130: Vendor Review per trip (hotel, restaurant, transport, dll)
// Path: components/tl/VendorReviewSection.jsx

import { useState, useTransition } from 'react';
import { addVendorReview, deleteVendorReview } from '@/lib/actions/tlreport';

const VENDOR_TYPES = [
  { value: 'hotel', label: '🏨 Hotel' },
  { value: 'restaurant', label: '🍽 Restaurant' },
  { value: 'transport', label: '🚌 Transport' },
  { value: 'guide', label: '👤 Local Guide' },
  { value: 'attraction', label: '🎢 Attraction/Tour' },
  { value: 'other', label: '📦 Other' },
];

const RECOMMEND = [
  { value: 'recommend', label: '👍 Recommend', color: 'bg-green-100 text-green-800' },
  { value: 'conditional', label: '🤔 Conditional', color: 'bg-amber-100 text-amber-800' },
  { value: 'not_recommend', label: '👎 Not Recommend', color: 'bg-red-100 text-red-800' },
];

export default function VendorReviewSection({ tripId, reviews = [], canEdit = true, userEmail = '' }) {
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const [vendorType, setVendorType] = useState(VENDOR_TYPES[0].value);
  const [vendorName, setVendorName] = useState('');
  const [cityCountry, setCityCountry] = useState('');
  const [rating, setRating] = useState(5);
  const [serviceRating, setServiceRating] = useState(5);
  const [cleanlinessRating, setCleanlinessRating] = useState(5);
  const [valueRating, setValueRating] = useState(5);
  const [pros, setPros] = useState('');
  const [cons, setCons] = useState('');
  const [recommendation, setRecommendation] = useState('recommend');
  const [notes, setNotes] = useState('');

  function resetForm() {
    setVendorName(''); setCityCountry('');
    setRating(5); setServiceRating(5); setCleanlinessRating(5); setValueRating(5);
    setPros(''); setCons(''); setNotes('');
    setRecommendation('recommend');
  }

  function handleAdd() {
    setError('');
    if (!vendorName.trim()) { setError('Vendor name wajib'); return; }
    startTransition(async () => {
      const r = await addVendorReview({
        tripId, vendorType, vendorName: vendorName.trim(),
        cityCountry: cityCountry.trim(),
        rating, serviceRating, cleanlinessRating, valueRating,
        pros: pros.trim(), cons: cons.trim(),
        recommendation, notes: notes.trim(),
        userEmail,
      });
      if (r?.error) { setError(r.error); return; }
      resetForm();
      setShowForm(false);
    });
  }

  function handleDelete(id, name) {
    if (!confirm(`Hapus review "${name}"?`)) return;
    startTransition(async () => {
      const r = await deleteVendorReview(id, tripId);
      if (r?.error) alert(r.error);
    });
  }

  // Group by type
  const reviewsByType = {};
  for (const r of reviews) {
    const t = r.vendor_type || 'other';
    if (!reviewsByType[t]) reviewsByType[t] = [];
    reviewsByType[t].push(r);
  }

  // Average rating overall
  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : null;

  return (
    <div className="bg-white rounded-xl border-2 border-yellow-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b bg-yellow-50 border-yellow-200 flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-yellow-800 flex items-center gap-2">
          <span>⭐</span> Vendor Reviews
          {reviews.length > 0 && (
            <span className="text-xs font-semibold text-slate-600">
              ({reviews.length} review · ⭐ {avgRating}/5)
            </span>
          )}
        </h2>
        {canEdit && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 rounded bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-bold"
          >
            + Tambah Review
          </button>
        )}
      </div>

      {showForm && (
        <div className="p-5 bg-yellow-50/40 border-b border-yellow-100 space-y-3">
          <h3 className="text-sm font-bold text-yellow-800">Review Vendor Baru</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Tipe Vendor" required>
              <select value={vendorType} onChange={(e) => setVendorType(e.target.value)} className={inputCls}>
                {VENDOR_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </Field>
            <Field label="Nama Vendor" required>
              <input
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="Contoh: Hotel ABC / Restaurant XYZ"
                className={inputCls}
              />
            </Field>
            <Field label="Lokasi (Kota, Negara)" className="md:col-span-2">
              <input
                value={cityCountry}
                onChange={(e) => setCityCountry(e.target.value)}
                placeholder="Contoh: Paris, France"
                className={inputCls}
              />
            </Field>
          </div>

          {/* Ratings */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-white rounded-lg border border-yellow-200">
            <StarRating label="⭐ Overall" value={rating} onChange={setRating} />
            <StarRating label="🤝 Service" value={serviceRating} onChange={setServiceRating} />
            <StarRating label="✨ Cleanliness" value={cleanlinessRating} onChange={setCleanlinessRating} />
            <StarRating label="💰 Value" value={valueRating} onChange={setValueRating} />
          </div>

          <Field label="Recommendation" required>
            <div className="flex gap-2 flex-wrap">
              {RECOMMEND.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRecommendation(r.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold border-2 transition-colors ${
                    recommendation === r.value
                      ? `${r.color} border-current`
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="✓ Pros (kelebihan)">
              <textarea value={pros} onChange={(e) => setPros(e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="Hal positif..." />
            </Field>
            <Field label="✗ Cons (kekurangan)">
              <textarea value={cons} onChange={(e) => setCons(e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="Hal yang kurang..." />
            </Field>
          </div>

          <Field label="Catatan tambahan">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
          </Field>

          {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">⚠ {error}</div>}

          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={pending}
              className="flex-1 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-bold rounded-lg disabled:opacity-50"
            >
              {pending ? 'Menyimpan...' : '⭐ Simpan Review'}
            </button>
            <button
              onClick={() => { setShowForm(false); resetForm(); setError(''); }}
              disabled={pending}
              className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {reviews.length === 0 ? (
        <div className="p-8 text-center text-slate-500">
          <p className="text-3xl mb-2">⭐</p>
          <p className="text-sm">Belum ada review vendor untuk trip ini.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {Object.entries(reviewsByType).map(([type, list]) => {
            const typeLabel = VENDOR_TYPES.find((v) => v.value === type)?.label || type;
            return (
              <div key={type} className="p-4">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">{typeLabel} ({list.length})</p>
                <div className="space-y-2">
                  {list.map((r) => {
                    const recCfg = RECOMMEND.find((rc) => rc.value === r.recommendation);
                    return (
                      <div key={r.id} className="p-3 bg-slate-50 rounded-lg group">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-slate-800">{r.vendor_name}</p>
                              <p className="text-sm">{[1,2,3,4,5].map((s) => r.rating >= s ? '⭐' : '☆').join('')}</p>
                              {recCfg && (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${recCfg.color}`}>
                                  {recCfg.label}
                                </span>
                              )}
                            </div>
                            {r.city_country && <p className="text-xs text-slate-500 mt-0.5">📍 {r.city_country}</p>}
                            <div className="mt-1 flex gap-3 text-[10px] text-slate-600">
                              {r.service_rating != null && <span>Service: {r.service_rating}/5</span>}
                              {r.cleanliness_rating != null && <span>Clean: {r.cleanliness_rating}/5</span>}
                              {r.value_rating != null && <span>Value: {r.value_rating}/5</span>}
                            </div>
                            {r.pros && <p className="text-xs text-green-700 mt-1">✓ {r.pros}</p>}
                            {r.cons && <p className="text-xs text-red-700 mt-0.5">✗ {r.cons}</p>}
                            {r.notes && <p className="text-xs italic text-slate-500 mt-1">{r.notes}</p>}
                            <p className="text-[10px] text-slate-400 mt-1">By {r.reviewed_by || '—'}</p>
                          </div>
                          {canEdit && (
                            <button
                              onClick={() => handleDelete(r.id, r.vendor_name)}
                              disabled={pending}
                              className="opacity-0 group-hover:opacity-100 text-[10px] px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700 font-bold disabled:opacity-50 transition-opacity"
                            >
                              🗑
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, required, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-semibold text-slate-700 block mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

function StarRating({ label, value, onChange }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-600 mb-1">{label}</p>
      <div className="flex items-center gap-0.5">
        {[1,2,3,4,5].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={`text-lg transition-transform hover:scale-110 ${value >= s ? '' : 'opacity-30 grayscale'}`}
          >
            ⭐
          </button>
        ))}
      </div>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-1 focus:ring-yellow-500 outline-none bg-white';
