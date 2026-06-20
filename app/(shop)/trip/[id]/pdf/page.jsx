import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { resolveBrandCode } from '@/lib/brand-shared';
import { defaultTermsFor } from '@/lib/shop/default-terms';
import { getTripForPdf, tripPrice, tripRoomPrices, getStorefrontSettingsPublic } from '@/lib/shop/data';
import { storefrontConfig } from '@/lib/shop/storefront-config';
import PrintButton from '@/components/shop/PrintButton';

export const dynamic = 'force-dynamic';

function fmtRp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
function fmtDate(d) { if (!d) return ''; try { return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; } }
function lines(s) { return String(s || '').split('\n').map((l) => l.trim()).filter(Boolean); }

export default async function TripPdfPage({ params }) {
  const { id } = await params;
  const t = await getTripForPdf(id);
  if (!t) notFound();
  let brand = 'teone';
  try { const h = headers(); brand = h.get('x-brand') || resolveBrandCode({ host: h.get('host') }) || 'teone'; } catch {}
  const cfg = storefrontConfig(brand);
  const c = cfg.contact || {};
  const rooms = tripRoomPrices(t);
  const itin = Array.isArray(t.itinerary) ? t.itinerary : [];
  const sched = Array.isArray(t.web_payment_schedule) ? t.web_payment_schedule : [];
  const settings = await getStorefrontSettingsPublic();
  const skText = (t.syarat_ketentuan && t.syarat_ketentuan.trim()) ? t.syarat_ketentuan : ((settings?.terms_default && settings.terms_default.trim()) ? settings.terms_default : defaultTermsFor(brand));
  const sk = lines(skText);
  const visa = lines(t.syarat_visa);
  const title = t.public_title || t.name;

  return (
    <div className="max-w-3xl mx-auto p-8 text-slate-800 bg-white">
      <style>{`@media print{.no-print{display:none!important}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}} @page{margin:14mm}`}</style>

      <div className="no-print mb-4 flex items-center justify-between">
        <span className="text-xs text-slate-400">Pratinjau PDF — klik tombol untuk simpan sebagai PDF</span>
        <PrintButton />
      </div>

      <div className="flex items-center justify-between border-b-2 border-slate-200 pb-3 mb-4">
        <div>
          <h1 className="text-2xl font-extrabold">{title}</h1>
          <p className="text-sm text-slate-500">{fmtDate(t.departure)}{t.return_date ? ` – ${fmtDate(t.return_date)}` : ''}{t.destination ? ` · ${t.destination}` : ''}</p>
        </div>
        <p className="text-right font-extrabold text-lg">{cfg.brandName}</p>
      </div>

      {t.cover_image_url && <img src={t.cover_image_url} alt="" className="w-full h-56 object-cover rounded-xl mb-4" />}

      {t.highlights && <p className="text-sm font-semibold text-emerald-700 mb-3">⭐ {t.highlights}</p>}
      {t.description && <p className="text-sm text-slate-600 whitespace-pre-line mb-4">{t.description}</p>}

      {rooms.length > 0 && (
        <section className="mb-4">
          <h2 className="font-bold text-slate-900 mb-1.5">Harga per Tipe Kamar (per orang)</h2>
          <table className="w-full text-sm border border-slate-200">
            <tbody>
              {rooms.map((r) => (
                <tr key={r.key} className="border-b border-slate-100">
                  <td className="px-3 py-1.5">{r.label}</td>
                  <td className="px-3 py-1.5 text-right font-bold">{fmtRp(r.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {t.dp_amount > 0 && <p className="text-sm text-emerald-700 font-semibold mt-1.5">Booking cukup DP {fmtRp(t.dp_amount)}</p>}
        </section>
      )}

      {sched.length > 0 && (
        <section className="mb-4">
          <h2 className="font-bold text-slate-900 mb-1.5">Skema Pembayaran</h2>
          <ul className="text-sm space-y-1">
            {t.dp_amount ? <li>DP — <b>{fmtRp(t.dp_amount)}</b></li> : null}
            {sched.filter((r) => r.type !== 'Pelunasan').map((r, i) => (
              <li key={i}>Payment {i + 1} — <b>{r.amount ? fmtRp(r.amount) : '-'}</b>{r.due ? ` · jatuh tempo ${fmtDate(r.due)}` : ''}</li>
            ))}
            {(() => { const p = sched.find((r) => r.type === 'Pelunasan'); return p ? <li>Pelunasan — <i>menyesuaikan sisa tagihan</i>{p.due ? ` · jatuh tempo ${fmtDate(p.due)}` : ''}</li> : null; })()}
          </ul>
        </section>
      )}

      {itin.length > 0 && (
        <section className="mb-4">
          <h2 className="font-bold text-slate-900 mb-1.5">Itinerary</h2>
          <div className="space-y-2">
            {itin.map((d, i) => (
              <div key={i} className="text-sm">
                <p className="font-semibold">Hari {d.day || i + 1}{d.title ? ` — ${d.title}` : ''}</p>
                {d.detail && <p className="text-slate-600 whitespace-pre-line">{d.detail}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-4 mb-4">
        {t.included && <div><h2 className="font-bold text-emerald-700 mb-1">Termasuk</h2><p className="text-sm text-slate-600 whitespace-pre-line">{t.included}</p></div>}
        {t.excluded && <div><h2 className="font-bold text-red-600 mb-1">Tidak Termasuk</h2><p className="text-sm text-slate-600 whitespace-pre-line">{t.excluded}</p></div>}
      </div>

      {visa.length > 0 && (
        <section className="mb-4">
          <h2 className="font-bold text-slate-900 mb-1.5">Syarat Visa</h2>
          <ul className="text-sm text-slate-600 list-disc pl-5">{visa.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </section>
      )}

      {sk.length > 0 && (
        <section className="mb-4">
          <h2 className="font-bold text-slate-900 mb-1.5">Syarat &amp; Ketentuan</h2>
          <ul className="text-sm text-slate-600 space-y-0.5">
            {sk.map((l, i) => { const head = /:$/.test(l) || (l.length > 4 && l === l.toUpperCase()); return head ? <li key={i} className="font-bold mt-2 list-none">{l}</li> : <li key={i} className="list-disc ml-5">{l}</li>; })}
          </ul>
        </section>
      )}

      <div className="border-t-2 border-slate-200 pt-3 mt-6 text-sm text-slate-600">
        <p className="font-bold text-slate-800">{cfg.brandName} — Contact</p>
        {c.phone && <p>WhatsApp: 0{String(c.phone).replace(/^62/, '')}</p>}
        {c.email && <p>Email: {c.email}</p>}
        {c.address && <p>{c.address}</p>}
        {(c.instagram || c.tiktok) && <p>{c.instagram ? 'IG @travelingeropa' : ''}{c.instagram && c.tiktok ? ' · ' : ''}{c.tiktok ? 'TikTok @travelingeropa' : ''}</p>}
      </div>
    </div>
  );
}
