'use client';

// Form Private Trip Request brand-aware (dipakai di storefront). Submit → private_trip_requests.
import { useState, useTransition, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { submitPrivateTripRequest } from '@/lib/actions/private-trip-request';

const TRIP_TYPES = [
  { value: 'honeymoon', label: '💑 Honeymoon' },
  { value: 'family', label: '👨‍👩‍👧 Family' },
  { value: 'group', label: '👥 Group Teman' },
  { value: 'corporate', label: '🏢 Corporate/Kantor' },
  { value: 'school', label: '🎓 School Trip' },
  { value: 'umroh', label: '🕌 Umroh / Wisata Halal' },
  { value: 'other', label: '🌐 Lainnya' },
];
const ACCOMMODATION_TYPES = [
  { value: 'hotel_3', label: 'Hotel ⭐⭐⭐' },
  { value: 'hotel_4', label: 'Hotel ⭐⭐⭐⭐' },
  { value: 'hotel_5', label: 'Hotel ⭐⭐⭐⭐⭐' },
  { value: 'villa', label: '🏡 Villa' },
  { value: 'resort', label: '🏝 Resort' },
  { value: 'mixed', label: '🧳 Campuran' },
  { value: 'flexible', label: '🤝 Fleksibel / Sesuai Saran Tim' },
];

const inputCls = 'w-full px-3 py-2.5 border-2 border-slate-200 rounded-lg text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none bg-white transition';

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700 mb-1 block">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

function FormInner({ waNumber, accent = 'emerald' }) {
  const A = accent === 'blue'
    ? { ring: 'focus:border-blue-500 focus:ring-blue-100', legend: 'text-blue-700', btn: 'from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700', chip: 'bg-blue-500 hover:bg-blue-600' }
    : { ring: 'focus:border-emerald-500 focus:ring-emerald-100', legend: 'text-emerald-700', btn: 'from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700', chip: 'bg-emerald-500 hover:bg-emerald-600' };
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [referenceId, setReferenceId] = useState(null);
  const [utm, setUtm] = useState({ source: '', medium: '', campaign: '' });

  useEffect(() => {
    setUtm({
      source: searchParams.get('utm_source') || 'storefront',
      medium: searchParams.get('utm_medium') || 'web',
      campaign: searchParams.get('utm_campaign') || 'request_private_trip',
    });
  }, [searchParams]);

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.target);
    formData.append('utm_source', utm.source);
    formData.append('utm_medium', utm.medium);
    formData.append('utm_campaign', utm.campaign);
    startTransition(async () => {
      const r = await submitPrivateTripRequest(formData);
      if (r?.error) { setError(r.error); return; }
      setReferenceId(r.id || 'OK');
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  if (done) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-2xl font-bold text-emerald-700 mb-2">Request Terkirim!</h2>
        <p className="text-slate-700 mb-2">Terima kasih sudah mempercayakan trip impianmu kepada kami 🙏</p>
        {referenceId && referenceId !== 'OK' && (
          <p className="text-sm text-slate-500 font-mono mb-3">Reference ID: <b>#{referenceId}</b></p>
        )}
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mt-5 text-left">
          <p className="font-bold text-emerald-800 mb-2">📞 Selanjutnya?</p>
          <ol className="text-sm text-emerald-700 space-y-1 list-decimal list-inside">
            <li>Tim kami review request dalam <b>1×24 jam</b></li>
            <li>Kami hubungi via WhatsApp di nomor yang kamu kasih</li>
            <li>Diskusi detail + custom itinerary</li>
            <li>Kirim penawaran resmi (harga, jadwal, fasilitas)</li>
          </ol>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer" className={`px-5 py-2.5 rounded-full ${A.chip} text-white font-bold`}>💬 Chat CS Sekarang</a>
          <button onClick={() => { setDone(false); setReferenceId(null); }} className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-full font-semibold hover:bg-slate-200">← Request lain</button>
        </div>
      </div>
    );
  }

  return (
    <>
      {error && <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 mb-4 text-red-800 text-sm">⚠ {error}</div>}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-7 space-y-5">
        <input type="text" name="website_url" tabIndex="-1" autoComplete="off" style={{ position: 'absolute', left: '-9999px', height: 0, width: 0, opacity: 0 }} />

        <fieldset className="space-y-4">
          <legend className={`text-sm font-bold ${A.legend} uppercase tracking-wider mb-1`}>👤 Data Kontak</legend>
          <Field label="Nama Lengkap" required>
            <input name="name" type="text" required minLength={2} maxLength={100} placeholder="Contoh: Nurul Khasanah" className={inputCls} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="No HP / WhatsApp" required>
              <input name="phone" type="tel" required minLength={8} maxLength={20} placeholder="08xxxxxxxxxx" className={inputCls} />
            </Field>
            <Field label="Email (Opsional)">
              <input name="email" type="email" maxLength={100} placeholder="email@example.com" className={inputCls} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-4 pt-4 border-t border-slate-200">
          <legend className={`text-sm font-bold ${A.legend} uppercase tracking-wider mb-1`}>🌍 Detail Trip</legend>
          <Field label="Destinasi Tujuan" required>
            <input name="destination" type="text" required maxLength={200} placeholder="Contoh: Korea, Bali, Eropa Barat, Umroh+Turki" className={inputCls} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Tipe Trip">
              <select name="trip_type" className={inputCls}><option value="">— Pilih —</option>{TRIP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
            </Field>
            <Field label="Jumlah Peserta" required>
              <input name="pax_count" type="number" required min={1} max={100} defaultValue={2} className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Tanggal Mulai"><input name="start_date" type="date" className={inputCls} /></Field>
            <Field label="Tanggal Selesai"><input name="end_date" type="date" className={inputCls} /></Field>
          </div>
          <Field label="Tipe Akomodasi Preferensi">
            <select name="accommodation_type" className={inputCls}><option value="">— Pilih —</option>{ACCOMMODATION_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</select>
          </Field>
        </fieldset>

        <fieldset className="space-y-4 pt-4 border-t border-slate-200">
          <legend className={`text-sm font-bold ${A.legend} uppercase tracking-wider mb-1`}>💰 Estimasi Budget</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <Field label="Estimasi Budget (IDR)"><input name="estimate_budget" type="text" inputMode="numeric" placeholder="Contoh: 25000000" className={inputCls} /></Field>
            </div>
            <Field label="Per?"><select name="budget_type" className={inputCls}><option value="per_pax">Per Pax</option><option value="total">Total Group</option></select></Field>
          </div>
        </fieldset>

        <fieldset className="space-y-4 pt-4 border-t border-slate-200">
          <legend className={`text-sm font-bold ${A.legend} uppercase tracking-wider mb-1`}>📝 Ide & Request</legend>
          <Field label="Ide Itinerary / Tempat Wajib Dikunjungi">
            <textarea name="itinerary_idea" rows={3} maxLength={1000} placeholder="Contoh: Namsan Tower, Lotte World, Nami Island..." className={inputCls} />
          </Field>
          <Field label="Request Khusus / Special Need">
            <textarea name="special_request" rows={3} maxLength={500} placeholder="Contoh: halal food, akses wheelchair, baby chair, foto pre-wed..." className={inputCls} />
          </Field>
        </fieldset>

        <button type="submit" disabled={pending} className={`w-full py-3.5 bg-gradient-to-r ${A.btn} text-white text-base font-bold rounded-xl disabled:opacity-50 shadow-lg`}>
          {pending ? '⏳ Mengirim...' : '✈ Kirim Request Saya'}
        </button>
        <p className="text-xs text-center text-slate-500">Dengan submit, kamu setuju tim kami menghubungi via WhatsApp di nomor yang kamu kasih.</p>
      </form>
    </>
  );
}

export default function PrivateTripRequestForm({ waNumber = '628145460210', accent = 'emerald' }) {
  return <Suspense fallback={null}><FormInner waNumber={waNumber} accent={accent} /></Suspense>;
}
