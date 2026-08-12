// Tour Confirmation — layout KHUSUS KHASANAH TRAVEL (persis blanko resmi).
// Letterhead PT. KHASANAH GLOBAL TRAVELINDO + alamat Yogyakarta + logo + SKPPIU,
// tabel border hitam, watermark logo, highlight kuning pada judul General Information.
// TEONE memakai layout lama (tidak lewat komponen ini).
import PrintButton from '@/components/shop/PrintButton';

const KH = {
  company: 'PT. KHASANAH GLOBAL TRAVELINDO',
  address: [
    'Ruko Kirana Lowanu, Jl. Lowanu UH 9, sorosutan, Umbulharjo,',
    'Kota Yogyakarta Provinsi Daerah Istimewa Yogyakarta,',
    'Kode Pos 55162',
  ],
  skppiu: '91200072814610002',
};

function toBullets(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.replace(/^\s*[•\-*]\s*/, '').replace(/\s+$/, ''))
    .filter((l) => l.trim().length);
}

export default function TourConfirmationKhasanah({ tc, logo, itin = [], hotels = [], flight = [], generalInfo = [] }) {
  return (
    <div style={{ background: '#cfd8e3', fontFamily: 'Arial, Helvetica, sans-serif', color: '#111' }}>
      <style>{`
        * { box-sizing: border-box; }
        .kh-wrap { width: 210mm; margin: 0 auto; }
        .kh-page { width: 210mm; min-height: 296mm; background:#fff; position:relative; padding: 14mm 16mm; overflow:hidden; }
        .kh-tbl { width:100%; border-collapse: collapse; margin-top: 8px; position:relative; z-index:1; }
        .kh-tbl th { background:#fff; color:#000; font-weight:700; padding:8px; border:1px solid #000; font-size:13px; text-align:center; }
        .kh-tbl td { border:1px solid #000; padding:8px 10px; font-size:12.5px; vertical-align: top; }
        .kh-tbl tr { page-break-inside: avoid; break-inside: avoid; }
        .kh-hl { background:#ffff00; padding:0 2px; }
        .kh-gi li { line-height: 1.45; }
        .kh-sched { margin:0; padding-left:18px; }
        .kh-sched li { margin-bottom:3px; line-height:1.4; }
        @media screen and (max-width: 820px) {
          .kh-wrap { width: 100%; }
          .kh-page { width: 100%; min-height: auto; padding: 5mm 4mm; margin-bottom: 12px; }
        }
        @media screen { body{ padding:16px 0; } .kh-page{ box-shadow:0 6px 24px rgba(0,0,0,.18); margin-bottom:18px; } }
        @media print { @page { size:A4; margin:0; } body{ margin:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; } .no-print{ display:none !important; } .kh-page{ box-shadow:none; margin:0; } header, footer { display:none !important; } }
      `}</style>

      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 20, background: '#0f2540', color: '#fff', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, opacity: .85 }}>Tour Confirmation — klik untuk simpan/print sebagai PDF (A4)</span>
        <PrintButton />
      </div>

      <div className="kh-wrap">
        <div className="kh-page">
          {/* WATERMARK LOGO */}
          {logo && (
            <img src={logo} alt="" aria-hidden="true"
              style={{ position: 'absolute', top: '46%', left: '50%', transform: 'translate(-50%,-50%)', width: '75%', opacity: 0.07, zIndex: 0, pointerEvents: 'none' }} />
          )}

          {/* LETTERHEAD */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, position: 'relative', zIndex: 1 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.3 }}>{KH.company}</div>
              <div style={{ fontSize: 11, lineHeight: 1.45, marginTop: 4 }}>
                {KH.address.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            </div>
            <div style={{ textAlign: 'right', minWidth: 190 }}>
              {logo
                ? <img src={logo} alt="Khasanah Travel" style={{ height: 58, objectFit: 'contain' }} />
                : <b style={{ color: '#b45309', fontSize: 20 }}>Khasanah Travel</b>}
              <div style={{ fontSize: 10, fontWeight: 700, marginTop: 4 }}>SKPPIU : {KH.skppiu}</div>
            </div>
          </div>
          <div style={{ borderBottom: '1px solid #9ca3af', marginTop: 8 }} />

          {/* TITLE */}
          <h1 style={{ textAlign: 'center', fontSize: 15, fontWeight: 800, margin: '26px 0 18px' }}>TOUR CONFIRMATION</h1>

          {/* INFO */}
          <table style={{ fontSize: 12.5, marginLeft: 6, position: 'relative', zIndex: 1 }}><tbody>
            <InfoRow label="Group" value={<b><i>{tc.group_name || ''}</i></b>} />
            <InfoRow label="Periode" value={tc.periode || ''} />
            <InfoRow label="Tour Leader" value={tc.tour_leader || 'TBA'} />
            {tc.waktu_kumpul ? <InfoRow label="Waktu Kumpul" value={<span className="kh-hl">{tc.waktu_kumpul}</span>} /> : null}
            {tc.meeting_point ? <InfoRow label="Tempat Kumpul" value={tc.meeting_point} /> : null}
            {tc.meeting_note ? <InfoRow label="" value={<i>{tc.meeting_note}</i>} /> : null}
          </tbody></table>

          {/* DETAIL FLIGHT */}
          {flight.length > 0 && (
            <div style={{ marginTop: 18, position: 'relative', zIndex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 5 }}>Detail Flight :</div>
              <div style={{ border: '1px solid #000', padding: '8px 12px', fontSize: 12, lineHeight: 1.7, display: 'inline-block', minWidth: 330 }}>
                {flight.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            </div>
          )}

          {/* ITINERARY */}
          <h2 style={{ fontSize: 30, fontWeight: 800, margin: '26px 0 2px', letterSpacing: 0.5, position: 'relative', zIndex: 1 }}>ITINERARY</h2>
          <table className="kh-tbl">
            <thead><tr><th style={{ width: '25%' }}>Day</th><th style={{ width: '50%' }}>Schedule</th><th style={{ width: '25%' }}>Hotel</th></tr></thead>
            <tbody>
              {itin.length === 0 ? (
                <tr><td colSpan={3} style={{ textAlign: 'center', color: '#888' }}>Itinerary belum diisi.</td></tr>
              ) : itin.map((d, i) => {
                const bullets = toBullets(d.schedule);
                return (
                  <tr key={i}>
                    <td>
                      <div style={{ fontWeight: 800 }}>{d.day || `Day ${i + 1}`}{d.route ? ' :' : ''}</div>
                      {d.date && <div style={{ fontSize: 11.5, marginTop: 2 }}>{d.date}</div>}
                      {d.route && <div style={{ fontWeight: 800, marginTop: 6 }}>{d.route}</div>}
                    </td>
                    <td>
                      {bullets.length > 1 || (bullets.length === 1)
                        ? <ul className="kh-sched">{bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
                        : <span style={{ whiteSpace: 'pre-line' }}>{d.schedule || ''}</span>}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, whiteSpace: 'pre-line', verticalAlign: 'middle' }}>{d.hotel || ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* HOTELS + ADDRESS */}
          {hotels.length > 0 && (
            <div style={{ marginTop: 16, position: 'relative', zIndex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 5 }}>Daftar Hotel :</div>
              <table className="kh-tbl">
                <thead><tr><th style={{ width: '35%' }}>Nama Hotel</th><th>Alamat</th></tr></thead>
                <tbody>
                  {hotels.map((h, i) => (
                    <tr key={i}><td style={{ fontWeight: 700, whiteSpace: 'pre-line' }}>{h.name || ''}</td><td style={{ whiteSpace: 'pre-line' }}>{h.address || ''}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* GENERAL INFORMATION */}
          <h2 style={{ textAlign: 'center', margin: '28px 0 16px', position: 'relative', zIndex: 1 }}>
            <span className="kh-hl" style={{ fontSize: 16, fontWeight: 800, padding: '1px 6px' }}>GENERAL INFORMATION</span>
          </h2>
          <ol className="kh-gi" style={{ margin: 0, paddingLeft: 22, fontSize: 12, position: 'relative', zIndex: 1 }}>
            {generalInfo.map((sec, i) => (
              <li key={i} style={{ marginBottom: 14, breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                <div style={{ marginBottom: 5 }}>
                  <span className="kh-hl" style={{ fontWeight: 800, fontSize: 14 }}>{sec.title}</span>
                </div>
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

function InfoRow({ label, value }) {
  return (
    <tr>
      <td style={{ padding: '2px 0', fontWeight: 700, verticalAlign: 'top', width: 120 }}>{label}</td>
      <td style={{ padding: '2px 6px', verticalAlign: 'top' }}>:</td>
      <td style={{ padding: '2px 0', verticalAlign: 'top' }}>{value}</td>
    </tr>
  );
}
