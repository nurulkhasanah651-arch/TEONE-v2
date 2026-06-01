// Round 185: Public form alamat pengiriman — gak perlu login
// Path: app/delivery/[token]/page.jsx

import { getDeliveryInfoByToken } from '@/lib/actions/delivery';
import DeliveryForm from './DeliveryForm';

export const dynamic = 'force-dynamic';

export default async function DeliveryPage(props) {
  const params = await Promise.resolve(props.params);
  const token = params?.token;

  if (!token) {
    return <ErrorPage message="Token tidak valid" />;
  }

  const result = await getDeliveryInfoByToken(token);

  if (result?.error) {
    return <ErrorPage message={result.error} />;
  }

  const { passenger, customer, trip } = result;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)',
      padding: 20,
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <h1 style={{ color: '#5b21b6', margin: 0, fontSize: 24 }}>✈ TEONE</h1>
          <p style={{ color: '#6b21a8', margin: '4px 0 0', fontSize: 13 }}>Traveling Eropa</p>
        </div>

        <div style={{
          background: 'white',
          borderRadius: 16,
          padding: 24,
          boxShadow: '0 10px 40px rgba(91, 33, 182, 0.15)',
        }}>
          <h2 style={{ marginTop: 0, color: '#1e293b', fontSize: 20 }}>
            📦 Form Alamat Pengiriman Perlengkapan
          </h2>

          <div style={{
            background: '#f5f3ff',
            border: '1px solid #ddd6fe',
            borderRadius: 8,
            padding: 12,
            marginTop: 12,
          }}>
            <p style={{ margin: 0, fontSize: 13 }}>
              <b>Trip:</b> {trip?.kode_trip || ''} — {trip?.name || ''}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 13 }}>
              <b>Peserta:</b> {customer?.name || '—'}
            </p>
          </div>

          <DeliveryForm
            token={token}
            passenger={passenger}
            customer={customer}
            trip={trip}
          />
        </div>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: '#7c3aed' }}>
          🔒 Form ini aman — link unik khusus untuk kamu. Data hanya dipakai untuk pengiriman perlengkapan.
        </p>
      </div>
    </div>
  );
}

function ErrorPage({ message }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#fef2f2',
      padding: 20,
      fontFamily: 'system-ui',
    }}>
      <div style={{ maxWidth: 400, textAlign: 'center', background: 'white', borderRadius: 12, padding: 32, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
        <p style={{ fontSize: 40, margin: 0 }}>❌</p>
        <h2 style={{ color: '#991b1b', marginTop: 12 }}>Link Tidak Valid</h2>
        <p style={{ color: '#64748b', fontSize: 13 }}>{message}</p>
        <p style={{ color: '#64748b', fontSize: 12, marginTop: 16 }}>
          Hubungi CS TEONE untuk link baru.
        </p>
      </div>
    </div>
  );
}
