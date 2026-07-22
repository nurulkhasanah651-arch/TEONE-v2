import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { resolveBrandCode } from '@/lib/brand-shared';
import { getStorefrontSettingsPublic } from '@/lib/shop/data';
import { storefrontConfig } from '@/lib/shop/storefront-config';
import { getTCByToken } from '@/lib/actions/tour-confirmation';
import { TC_GENERAL_INFO } from '@/lib/shop/tc-terms';
import PrintButton from '@/components/shop/PrintButton';

export const dynamic = 'force-dynamic';

function lines(s) { return String(s || '').split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim().length); }

export default async function TourConfirmationPage({ params }) {
  const { token } = await params;
  const data = await getTCByToken(token);
  if (!data || !data.tc) notFound();
  const { tc, trip } = data;

  let brand = 'teone';
  try { const h = headers(); brand = h.get('x-brand') || resolveBrandCode({ host: h.get('host') }) || 'teone'; } catch {}
  const cfg = storefrontConfig(brand);
  const c = cfg.contact || {};
  const settings = await getStorefrontSettingsPublic();
  const logo = (settings?.logo_url || '').trim();

  const companyName = 'PT. KHASANAH GLOBAL INTERNASIONAL';
  const hqLine = c.address || 'Traveling Eropa HQ — Ruko Graha Boulevard, Jl. Gading Serpong Boulevard, Curug Sangereng, Kelapa Dua, Tangerang, Banten 15810';
  const phoneDisp = c.phone ? ('+' + String(c.phone).replace(/[^0-9]/g, '')) : '';
  const web = (c.email && c.email.split('@')[1]) || 'travelingeropa.com';

  const itin = Array.isArray(tc.itinerary) ? tc.itinerary : [];
  const hotels = Array.isArray(tc.hotels) ? tc.hotels.filter((h) => h && (h.name || h.address)) : [];
  const flight = lines(tc.detail_flight);
  const generalInfo = (Array.isArray(tc.general_info) && tc.general_info.length) ? tc.general_info : TC_GENERAL_INFO;

  const C = { primary: '#1f3b8c', ink: '#111', head: '#22357a', line: '#1f3b8c' };

  const InfoRow = ({ label, value, italic }) => (
    <tr>
      <td style={{ padding: '2px 0', fontWeight: 700, verticalAlign: 'top', width: 130 }}>{label}</td>
      <td style={{ padding: '2px 6px', verticalAlign: 'top' }}>:</td>
      <td style={{ padding: '2px 0', verticalAlign: 'top', fontStyle: italic ? 'italic' : 'normal', fontWeight: italic ? 400 : 600 }}>{value}</td>
    </tr>
  );

  return (
    <div style={{ background: '#cfd8e3', fontFamily: '"Times New Roman", Georgia, serif', color: C.ink }}>
      <style>{`
        * { box-sizing: border-box; }
        .pagewrap { width: 210mm; margin: 0 auto; }
        .page { width: 210mm; min-height: 296mm; background:#fff; position:relative; padding: 14mm 16mm; }
        .page:last-child { page-break-after: auto; }
        .avoidbreak { page-break-inside: avoid; break-inside: avoid; }
        .tcTable tr { page-break-inside: avoid; break-inside: avoid; }
        .tcTable td, .tcTable th { word-break: break-word; }
        /* HP: konten menyesuaikan lebar layar (bisa dibaca full, tidak cuma setengah) */
        @media screen and (max-width: 820px) {
          .pagewrap { width: 100%; }
          .page { width: 100%; min-height: auto; padding: 5mm 4mm; margin-bottom: 12px; }
        }
        .tcTable { width:100%; border-collapse: collapse; margin-top: 6px; }
        .tcTable th { background:${C.head}; color:#fff; font-weight:700; padding:6px 8px; border:1px solid ${C.line}; font-size:12.5px; text-align:center; }
        .tcTable td { border:1px solid ${C.line}; padding:6px 8px; font-size:12px; vertical-align: top; }
        .gi li { margin-bottom: 5px; line-height: 1.4; }
        @media screen { body{ padding:16px 0; } .page{ box-shadow:0 6px 24px rgba(0,0,0,.18); margin-bottom:18px; } }
        @media print { @page { size:A4; margin:0; } body{ margin:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; } .no-print{ display:none !important; } .page{ box-shadow:none; margin:0; } header, footer { display:none !important; } }
      `}</style>

      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0f2540', color: '#fff', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, opacity: .85 }}>Tour Confirmation — klik untuk simpan/print sebagai PDF (A4)</span>
        <PrintButton />
      </div>

      <div className="pagewrap">
        <div className="page">
          {/* LETTERHEAD */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, borderBottom: `3px solid ${C.line}`, paddingBottom: 8 }}>
            {logo ? <img src={logo} alt="" style={{ height: 54, objectFit: 'contain' }} /> : <b style={{ color: C.primary, fontSize: 20 }}>{cfg.brandName}</b>}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 0.5 }}>{companyName}</div>
              <div style={{ fontSize: 11.5, lineHeight: 1.35, marginTop: 2 }}>{hqLine}</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 22, flexWrap: 'wrap', background: 'linear-gradient(#000,#000)', color: '#fff', padding: '5px 8px', fontSize: 11.5, marginTop: 4 }}>
            {phoneDisp && <span>📞 {phoneDisp}</span>}
            {c.email && <span>✉ {c.email}</span>}
            <span>🌐 {web}</span>
          </div>

          {/* TITLE */}
          <h1 style={{ textAlign: 'center', fontSize: 20, fontWeight: 800, margin: '20px 0 16px', letterSpacing: 1 }}>TOUR CONFIRMATION</h1>

          {/* INFO */}
          <table style={{ fontSize: 13, marginLeft: 6 }}><tbody>
            <InfoRow label="Group" value={<b>{tc.group_name || ''}</b>} />
            <InfoRow label="Periode" value={tc.periode || ''} />
            <InfoRow label="Tour Leader" value={tc.tour_leader || 'TBA'} />
            {tc.waktu_kumpul ? <InfoRow label="Waktu Kumpul" value={tc.waktu_kumpul} /> : null}
            {tc.meeting_point ? <InfoRow label="Meeting Point" value={tc.meeting_point} /> : null}
            {tc.meeting_note ? <InfoRow label="" value={tc.meeting_note} italic /> : null}
          </tbody></table>

          {/* DETAIL FLIGHT */}
          {flight.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>Detail Flight :</div>
              <div style={{ border: `1px solid ${C.line}`, padding: '8px 12px', fontSize: 12.5, lineHeight: 1.6, display: 'inline-block', minWidth: 320 }}>
                {flight.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            </div>
          )}

          {/* ITINERARY */}
          <h2 style={{ textAlign: 'center', fontSize: 17, fontWeight: 800, margin: '22px 0 4px' }}>ITINERARY</h2>
          <table className="tcTable">
            <thead><tr><th style={{ width: '25%' }}>Day</th><th style={{ width: '50%' }}>Schedule</th><th style={{ width: '25%' }}>Hotel</th></tr></thead>
            <tbody>
              {itin.length === 0 ? (
                <tr><td colSpan={3} style={{ textAlign: 'center', color: '#888' }}>Itinerary belum diisi.</td></tr>
              ) : itin.map((d, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ fontWeight: 800 }}>{d.day || `Day ${i + 1}`}{d.route ? ' :' : ''}</div>
                    {d.route && <div style={{ fontWeight: 700 }}>{d.route}</div>}
                    {d.date && <div style={{ fontSize: 11.5 }}>{d.date}</div>}
                  </td>
                  <td style={{ whiteSpace: 'pre-line' }}>{d.schedule || ''}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, whiteSpace: 'pre-line' }}>{d.hotel || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* HOTELS + ADDRESS */}
          {hotels.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>Daftar Hotel :</div>
              <table className="tcTable">
                <thead><tr><th style={{ width: '35%' }}>Nama Hotel</th><th>Alamat</th></tr></thead>
                <tbody>
                  {hotels.map((h, i) => (
                    <tr key={i}><td style={{ fontWeight: 700, whiteSpace: 'pre-line' }}>{h.name || ''}</td><td style={{ whiteSpace: 'pre-line' }}>{h.address || ''}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* GENERAL INFORMATION — nyambung langsung di bawah itinerary/hotel (tanpa page break) */}
          <h2 style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, margin: '26px 0 14px' }}>GENERAL INFORMATION</h2>
          <ol className="gi" style={{ margin: 0, paddingLeft: 20, fontSize: 12 }}>
            {generalInfo.map((sec, i) => (
              <li key={i} className="avoidbreak" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>{sec.title}</div>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
                  {sec.items.map((it, j) => <li key={j} style={{ marginBottom: 4 }}>{it}</li>)}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
