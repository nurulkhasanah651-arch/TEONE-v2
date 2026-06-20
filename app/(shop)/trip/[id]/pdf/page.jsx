import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { resolveBrandCode } from '@/lib/brand-shared';
import { defaultTermsFor } from '@/lib/shop/default-terms';
import { getTripForPdf, tripRoomPrices, getStorefrontSettingsPublic } from '@/lib/shop/data';
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
  const settings = await getStorefrontSettingsPublic();
  const logo = (settings?.logo_url || '').trim();
  const rooms = tripRoomPrices(t);
  const itin = Array.isArray(t.itinerary) ? t.itinerary : [];
  const sched = Array.isArray(t.web_payment_schedule) ? t.web_payment_schedule : [];
  const gallery = [t.cover_image_url, ...(Array.isArray(t.gallery_images) ? t.gallery_images : [])].filter(Boolean);
  const skText = (t.syarat_ketentuan && t.syarat_ketentuan.trim()) ? t.syarat_ketentuan : ((settings?.terms_default && settings.terms_default.trim()) ? settings.terms_default : defaultTermsFor(brand));
  const sk = lines(skText);
  const visa = lines(t.syarat_visa);
  const incl = lines(t.included);
  const excl = lines(t.excluded);
  const title = t.public_title || t.name;
  const dates = `${fmtDate(t.departure)}${t.return_date ? ' – ' + fmtDate(t.return_date) : ''}`;
  const web = (c.email && c.email.split('@')[1]) || 'travelingeropa.com';
  const phoneDisp = c.phone ? ('0' + String(c.phone).replace(/^62/, '')) : '';

  const C = { primary: '#0b4fa3', primary2: '#1e7fd6', sky1: '#eaf4ff', ink: '#0f2540', gold: '#f4a623' };

  const Brand = () => (logo
    ? <img src={logo} alt="" style={{ height: 26, objectFit: 'contain' }} />
    : <b style={{ color: C.primary, fontSize: 16 }}>{cfg.brandName}</b>);

  const SectionHead = ({ children }) => (
    <div style={{ display: 'inline-block', background: C.primary, color: '#fff', fontWeight: 800, fontSize: 20, letterSpacing: 0.5, padding: '8px 22px', borderRadius: 999, marginBottom: 18, textTransform: 'uppercase' }}>{children}</div>
  );
  const TopBar = () => (
    <div className="topbar"><Brand /><span className="muted" style={{ fontSize: 12 }}>{web}</span></div>
  );

  return (
    <div style={{ background: '#cfd8e3', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', color: C.ink }}>
      <style>{`
        * { box-sizing: border-box; }
        .pagewrap { width: 210mm; margin: 0 auto; }
        .page { width: 210mm; min-height: 297mm; background: #fff; position: relative; overflow: hidden; page-break-after: always; }
        .page:last-child { page-break-after: auto; }
        .pad { padding: 16mm; }
        .topbar { display:flex; align-items:center; justify-content:space-between; padding: 10mm 16mm 0; }
        .muted { color:#5b6b80; }
        table.price { width:100%; border-collapse:separate; border-spacing:0 8px; }
        table.price td { padding: 12px 16px; background:${C.sky1}; }
        table.price tr td:first-child { border-radius: 12px 0 0 12px; font-weight:700; }
        table.price tr td:last-child { border-radius: 0 12px 12px 0; text-align:right; font-weight:800; color:${C.primary}; }
        .itin td { vertical-align: top; }
        @media screen { body{ padding: 16px 0; } .page{ box-shadow: 0 6px 24px rgba(0,0,0,.18); margin-bottom: 18px; } }
        @media print { @page { size: A4; margin: 0; } body { margin:0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display:none !important; } .page { box-shadow:none; margin:0; } }
      `}</style>

      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0f2540', color: '#fff', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, opacity: .85 }}>Pratinjau brosur PDF — klik untuk simpan/print sebagai PDF (A4)</span>
        <PrintButton />
      </div>

      <div className="pagewrap">

        {/* COVER */}
        <div className="page" style={{ background: `linear-gradient(160deg, ${C.primary} 0%, ${C.primary2} 45%, #7cc0f5 100%)`, color: '#fff', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16mm 16mm 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {logo ? <img src={logo} alt="" style={{ height: 42, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} /> : <b style={{ fontSize: 22 }}>{cfg.brandName}</b>}
            {c.email && <span style={{ fontSize: 12, opacity: .9 }}>{c.email}</span>}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '0 18mm' }}>
            <span style={{ background: C.gold, color: '#3a2400', fontWeight: 800, padding: '6px 18px', borderRadius: 999, fontSize: 13, letterSpacing: 1 }}>{(cfg.brandName || '').toUpperCase()}</span>
            <h1 style={{ fontSize: 44, fontWeight: 900, lineHeight: 1.05, margin: '18px 0 10px', textShadow: '0 2px 12px rgba(0,0,0,.25)' }}>{title}</h1>
            {dates && <p style={{ fontSize: 18, fontWeight: 700, background: 'rgba(255,255,255,.18)', padding: '8px 20px', borderRadius: 999 }}>{dates}</p>}
            <p style={{ marginTop: 18, fontSize: 16, fontWeight: 600, letterSpacing: 2, opacity: .95 }}>TRIP TERPERCAYA</p>
          </div>
          <div style={{ padding: '0 16mm 16mm', textAlign: 'center', fontSize: 13, lineHeight: 1.6 }}>
            {phoneDisp && <p style={{ fontWeight: 800, fontSize: 18 }}>{phoneDisp}</p>}
            <p style={{ opacity: .92 }}>{web}</p>
            {c.address && <p style={{ opacity: .85, fontSize: 11, marginTop: 6, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>{c.address}</p>}
          </div>
        </div>

        {/* HARGA */}
        {(rooms.length > 0 || t.dp_amount > 0) && (
          <div className="page">
            <TopBar />
            <div className="pad">
              <SectionHead>Harga Paket</SectionHead>
              <h2 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 6px' }}>{title}</h2>
              {dates && <p style={{ display: 'inline-block', background: C.primary, color: '#fff', padding: '6px 16px', borderRadius: 999, fontWeight: 700, fontSize: 13, marginBottom: 18 }}>{dates}</p>}
              {rooms.length > 0 ? (
                <table className="price"><tbody>
                  {rooms.map((r) => (<tr key={r.key}><td>{r.label}</td><td>{fmtRp(r.price)}</td></tr>))}
                </tbody></table>
              ) : <p className="muted">Harga paket belum diisi.</p>}
              {rooms[0]?.addons?.length > 0 && (
                <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>Sudah termasuk biaya wajib: {rooms[0].addons.map((a) => `${a.label} ${fmtRp(a.value)}`).join(' · ')}. Visa &amp; opsional tidak termasuk.</p>
              )}
              {t.dp_amount > 0 && (
                <div style={{ marginTop: 26, background: `linear-gradient(135deg, ${C.primary}, ${C.primary2})`, color: '#fff', borderRadius: 16, padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>Booking cukup DP</span>
                  <span style={{ fontWeight: 900, fontSize: 26 }}>{fmtRp(t.dp_amount)}<span style={{ fontSize: 13, fontWeight: 600, opacity: .85 }}> /orang</span></span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FASILITAS */}
        {(incl.length > 0 || excl.length > 0) && (
          <div className="page">
            <TopBar />
            <div className="pad">
              <SectionHead>Fasilitas</SectionHead>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
                {incl.length > 0 && (
                  <div style={{ border: '2px solid #cfe6d4', borderRadius: 16, padding: 18 }}>
                    <p style={{ fontWeight: 800, color: '#1a8c4a', marginBottom: 10, fontSize: 16 }}>✓ Include</p>
                    <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, fontSize: 13 }}>{incl.map((l, i) => <li key={i}>{l}</li>)}</ul>
                  </div>
                )}
                {excl.length > 0 && (
                  <div style={{ border: '2px solid #f3d2d2', borderRadius: 16, padding: 18 }}>
                    <p style={{ fontWeight: 800, color: '#c0392b', marginBottom: 10, fontSize: 16 }}>✕ Exclude</p>
                    <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, fontSize: 13 }}>{excl.map((l, i) => <li key={i}>{l}</li>)}</ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* HIGHLIGHT FOTO */}
        {gallery.length >= 2 && (
          <div className="page">
            <TopBar />
            <div className="pad">
              <SectionHead>Highlight Destination</SectionHead>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {gallery.slice(0, 8).map((src, i) => (<img key={i} src={src} alt="" style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 12 }} />))}
              </div>
            </div>
          </div>
        )}

        {/* ITINERARY */}
        {itin.length > 0 && (
          <div className="page">
            <TopBar />
            <div className="pad">
              <SectionHead>Itinerary</SectionHead>
              <table style={{ width: '100%', borderCollapse: 'collapse' }} className="itin">
                <thead>
                  <tr style={{ background: C.primary, color: '#fff' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 800, width: '34%' }}>Hari</td>
                    <td style={{ padding: '10px 14px', fontWeight: 800 }}>Tujuan / Acara</td>
                  </tr>
                </thead>
                <tbody>
                  {itin.map((d, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #e6edf5' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 700 }}>Day {d.day || i + 1}{d.title ? <span style={{ display: 'block', fontWeight: 600, color: '#42566e', fontSize: 12 }}>{d.title}</span> : null}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#33475e', whiteSpace: 'pre-line' }}>{d.detail || d.title || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PEMBAYARAN + VISA + S&K */}
        {(sched.length > 0 || visa.length > 0 || sk.length > 0) && (
          <div className="page">
            <TopBar />
            <div className="pad" style={{ paddingBottom: '40mm' }}>
              {sched.length > 0 && (
                <div style={{ marginBottom: 22 }}>
                  <SectionHead>Skema Pembayaran</SectionHead>
                  <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, fontSize: 13 }}>
                    {t.dp_amount ? <li>DP — <b>{fmtRp(t.dp_amount)}</b></li> : null}
                    {sched.filter((r) => r.type !== 'Pelunasan').map((r, i) => <li key={i}>Payment {i + 1} — <b>{r.amount ? fmtRp(r.amount) : '-'}</b>{r.due ? ` · jatuh tempo ${fmtDate(r.due)}` : ''}</li>)}
                    {(() => { const p = sched.find((r) => r.type === 'Pelunasan'); return p ? <li>Pelunasan — <i>menyesuaikan sisa tagihan</i>{p.due ? ` · jatuh tempo ${fmtDate(p.due)}` : ''}</li> : null; })()}
                  </ul>
                </div>
              )}
              {visa.length > 0 && (
                <div style={{ marginBottom: 22 }}>
                  <SectionHead>Syarat Visa</SectionHead>
                  <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8, fontSize: 12.5 }}>{visa.map((l, i) => <li key={i}>{l}</li>)}</ul>
                </div>
              )}
              {sk.length > 0 && (
                <div>
                  <SectionHead>Syarat &amp; Ketentuan</SectionHead>
                  <ul style={{ margin: 0, padding: 0, lineHeight: 1.7, fontSize: 12 }}>
                    {sk.map((l, i) => { const head = /:$/.test(l) || (l.length > 4 && l === l.toUpperCase()); return head ? <li key={i} style={{ fontWeight: 800, marginTop: 8, listStyle: 'none' }}>{l}</li> : <li key={i} style={{ marginLeft: 18 }}>{l}</li>; })}
                  </ul>
                </div>
              )}
            </div>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: C.primary, color: '#fff', padding: '14px 16mm', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
              <div>
                <b style={{ fontSize: 14 }}>{cfg.brandName}</b>
                {c.address && <div style={{ opacity: .85, fontSize: 10.5, maxWidth: 360 }}>{c.address}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                {phoneDisp && <div style={{ fontWeight: 800 }}>{phoneDisp}</div>}
                {c.email && <div style={{ opacity: .9 }}>{c.email}</div>}
                <div style={{ opacity: .9 }}>IG @travelingeropa · TikTok @travelingeropa</div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
