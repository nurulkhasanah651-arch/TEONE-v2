'use client';

// R224: Public form — Private Trip Request (no auth required)
// Path: app/request-private-trip/page.jsx
// URL: teone.dev/request-private-trip

import { useState, useTransition, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { submitPrivateTripRequest } from '@/lib/actions/private-trip-request';

const TRIP_TYPES = [
  { value: 'honeymoon', label: '💑 Honeymoon' },
  { value: 'family', label: '👨‍👩‍👧 Family' },
  { value: 'group', label: '👥 Group Friends' },
  { value: 'corporate', label: '🏢 Corporate/Office' },
  { value: 'school', label: '🎓 School Trip' },
  { value: 'other', label: '🌐 Lainnya' },
];

const ACCOMMODATION_TYPES = [
  { value: 'hotel_3', label: 'Hotel ⭐⭐⭐' },
  { value: 'hotel_4', label: 'Hotel ⭐⭐⭐⭐' },
  { value: 'hotel_5', label: 'Hotel ⭐⭐⭐⭐⭐' },
  { value: 'villa', label: '🏡 Villa' },
  { value: 'resort', label: '🏝 Resort' },
  { value: 'mixed', label: '🧳 Campuran (Sesuai Itinerary)' },
  { value: 'flexible', label: '🤝 Fleksibel / Sesuai Saran Tim' },
];

export default function RequestPrivateTripPage() {
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [referenceId, setReferenceId] = useState(null);

  // UTM tracking from URL
  const [utm, setUtm] = useState({ source: '', medium: '', campaign: '' });
  useEffect(() => {
    setUtm({
      source: searchParams.get('utm_source') || '',
      medium: searchParams.get('utm_medium') || '',
      campaign: searchParams.get('utm_campaign') || '',
    });
  }, [searchParams]);

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.target);
    // Inject UTM
    formData.append('utm_source', utm.source);
    formData.append('utm_medium', utm.medium);
    formData.append('utm_campaign', utm.campaign);

    startTransition(async () => {
      const r = await submitPrivateTripRequest(formData);
      if (r?.error) {
        setError(r.error);
        return;
      }
      setReferenceId(r.id || 'OK');
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 py-12 px-4">
        <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-3xl font-bold text-emerald-700 mb-3">Request Terkirim!</h1>
          <p className="text-slate-700 text-lg mb-2">
            Terima kasih sudah mempercayakan trip impian kamu kepada kami 🙏
          </p>
          {referenceId && referenceId !== 'OK' && (
            <p className="text-sm text-slate-500 font-mono mb-4">
              Reference ID: <span className="font-bold">#{referenceId}</span>
            </p>
          )}
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mt-6 text-left">
            <p className="font-bold text-indigo-800 mb-2">📞 Apa selanjutnya?</p>
            <ol className="text-sm text-indigo-700 space-y-1 list-decimal list-inside">
              <li>Tim kami akan review request kamu dalam <b>1×24 jam</b></li>
              <li>Kami hubungi via WhatsApp/telepon di nomor yg kamu kasih</li>
              <li>Diskusi detail + custom itinerary sesuai keinginan kamu</li>
              <li>Kirim penawaran resmi (price, schedule, inclusions)</li>
            </ol>
          </div>
          <button
            onClick={() => { setDone(false); setReferenceId(null); }}
            className="mt-6 px-6 py-2 bg-slate-100 text-slate-700 rounded-lg font-semibold hover:bg-slate-200"
          >
            ← Submit request lain
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-indigo-800 mb-2">
            ✈ Request Private Trip
          </h1>
          <p className="text-slate-600">
            Customize trip impian kamu — kami susunin penawaran sesuai keinginan
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 mb-4 text-red-800">
            ⚠ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-6 md:p-8 space-y-5">
          {/* Honeypot — hidden from real users */}
          <input
            type="text"
            name="website_url"
            tabIndex="-1"
            autoComplete="off"
            style={{ position: 'absolute', left: '-9999px', height: 0, width: 0, opacity: 0 }}
          />

          {/* Section 1: Kontak */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-bold text-indigo-700 uppercase tracking-wider mb-2">
              👤 Data Kontak
            </legend>

            <Field label="Nama Lengkap" required>
              <input name="name" type="text" required minLength={2} maxLength={100}
                placeholder="Contoh: Nurul Khasanah"
                className={inputCls} />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="No HP / WhatsApp" required>
                <input name="phone" type="tel" required minLength={8} maxLength={20}
                  placeholder="08xxxxxxxxxx"
                  className={inputCls} />
              </Field>
              <Field label="Email (Opsional)">
                <input name="email" type="email" maxLength={100}
                  placeholder="email@example.com"
                  className={inputCls} />
              </Field>
            </div>
          </fieldset>

          {/* Section 2: Trip */}
          <fieldset className="space-y-4 pt-4 border-t border-slate-200">
            <legend className="text-sm font-bold text-indigo-700 uppercase tracking-wider mb-2">
              🌍 Detail Trip
            </legend>

            <Field label="Destinasi Tujuan" required>
              <input name="destination" type="text" required maxLength={200}
                placeholder="Contoh: Korea Selatan, Bali, Eropa Barat, Umroh, dll"
                className={inputCls} />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Tipe Trip">
                <select name="trip_type" className={inputCls}>
                  <option value="">— Pilih —</option>
                  {TRIP_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Jumlah Peserta" required>
                <input name="pax_count" type="number" required min={1} max={100} defaultValue={2}
                  className={inputCls} />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Tanggal Mulai">
                <input name="start_date" type="date" className={inputCls} />
              </Field>
              <Field label="Tanggal Selesai">
                <input name="end_date" type="date" className={inputCls} />
              </Field>
            </div>

            <Field label="Tipe Akomodasi Preferensi">
              <select name="accommodation_type" className={inputCls}>
                <option value="">— Pilih —</option>
                {ACCOMMODATION_TYPES.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </Field>
          </fieldset>

          {/* Section 3: Budget */}
          <fieldset className="space-y-4 pt-4 border-t border-slate-200">
            <legend className="text-sm font-bold text-indigo-700 uppercase tracking-wider mb-2">
              💰 Estimasi Budget
            </legend>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <Field label="Estimate Budget (IDR)">
                  <input name="estimate_budget" type="text" inputMode="numeric"
                    placeholder="Contoh: 25000000"
                    className={inputCls} />
                </Field>
              </div>
              <Field label="Per?">
                <select name="budget_type" className={inputCls}>
                  <option value="per_pax">Per Pax</option>
                  <option value="total">Total Group</option>
                </select>
              </Field>
            </div>
          </fieldset>

          {/* Section 4: Detail */}
          <fieldset className="space-y-4 pt-4 border-t border-slate-200">
            <legend className="text-sm font-bold text-indigo-700 uppercase tracking-wider mb-2">
              📝 Ide & Request
            </legend>

            <Field label="Ide Itinerary / Tempat Wajib Dikunjungi">
              <textarea name="itinerary_idea" rows={3} maxLength={1000}
                placeholder="Contoh: Mau ke Namsan Tower, Lotte World, Myeongdong, Nami Island..."
                className={inputCls} />
            </Field>

            <Field label="Request Khusus / Special Need">
              <textarea name="special_request" rows={3} maxLength={500}
                placeholder="Contoh: vegetarian, halal food, akses wheelchair, baby chair, foto pre-wed, dll"
                className={inputCls} />
            </Field>
          </fieldset>

          <button
            type="submit"
            disabled={pending}
            className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-lg font-bold rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 shadow-lg"
          >
            {pending ? '⏳ Mengirim...' : '✈ Kirim Request Saya'}
          </button>

          <p className="text-xs text-center text-slate-500">
            Dengan submit, kamu setuju tim kami menghubungi via WhatsApp di nomor yg kamu kasih
          </p>
        </form>

        {/* Footer */}
        <div className="text-center mt-6 text-xs text-slate-500">
          <p>TEONE — Traveling Eropa One System</p>
          <p className="mt-1">
            Butuh bantuan? <a href="https://wa.me/628xxxxxxxx" className="text-indigo-600 font-semibold hover:underline">WhatsApp Admin</a>
          </p>
        </div>
      </div>
    </div>
  );
}

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

const inputCls = 'w-full px-3 py-2.5 border-2 border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none bg-white transition';
