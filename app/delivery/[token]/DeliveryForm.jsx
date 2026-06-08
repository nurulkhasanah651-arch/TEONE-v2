'use client';

// Round 185: DeliveryForm — public form alamat
// Path: app/delivery/[token]/DeliveryForm.jsx

import { useState, useTransition } from 'react';
import { submitDeliveryAddress } from '@/lib/actions/delivery';

export default function DeliveryForm({ token, passenger, customer, trip }) {
  const [pending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(passenger.delivery_status !== 'pending');
  const [error, setError] = useState('');

  const initial = {
    recipient: passenger.delivery_recipient || customer?.name || '',
    phone: passenger.delivery_phone || customer?.phone || '',
    email: passenger.delivery_email || customer?.email || '',
    street: passenger.delivery_street || '',
    kelurahan: passenger.delivery_kelurahan || '',
    kecamatan: passenger.delivery_kecamatan || '',
    kota: passenger.delivery_kota || '',
    provinsi: passenger.delivery_provinsi || '',
    kode_pos: passenger.delivery_kode_pos || '',
    notes: passenger.delivery_notes || '',
  };

  const [form, setForm] = useState(initial);

  function upd(k, v) { setForm((s) => ({ ...s, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) {
      fd.append(k, v);
    }
    startTransition(async () => {
      const r = await submitDeliveryAddress(token, fd);
      if (r?.error) setError(r.error);
      else setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <p style={{ fontSize: 64, margin: 0 }}>✅</p>
        <h3 style={{ color: '#166534', marginTop: 8 }}>Alamat Tersimpan!</h3>
        <p style={{ color: '#475569', fontSize: 14 }}>
          Terima kasih, {form.recipient || customer?.name}.<br />
          Perlengkapan akan kami kirim H-7 sebelum keberangkatan.
        </p>

        <div style={{
          marginTop: 20, padding: 16, background: '#f8fafc',
          borderRadius: 8, textAlign: 'left', fontSize: 13
        }}>
          <p style={{ margin: 0, fontWeight: 'bold', color: '#475569' }}>📍 Alamat Tersimpan:</p>
          <p style={{ margin: '6px 0 2px', color: '#1e293b' }}>{form.recipient}</p>
          <p style={{ margin: 0, color: '#475569' }}>{form.phone}</p>
          <p style={{ margin: '6px 0 0', color: '#475569' }}>
            {form.street}<br />
            {form.kelurahan}, {form.kecamatan}<br />
            {form.kota}, {form.provinsi} {form.kode_pos}
          </p>
          {form.notes && <p style={{ margin: '6px 0 0', color: '#64748b', fontStyle: 'italic' }}>📝 {form.notes}</p>}
        </div>

        <button
          onClick={() => setSubmitted(false)}
          style={{
            marginTop: 16, padding: '8px 16px',
            background: 'transparent', border: '1px solid #cbd5e1',
            borderRadius: 8, color: '#475569', fontSize: 13, cursor: 'pointer'
          }}
        >
          ✎ Edit Alamat
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

      <Field label="Nama Penerima" required>
        <input autoComplete="off"
          type="text"
          required
          value={form.recipient}
          onChange={(e) => upd('recipient', e.target.value)}
          placeholder="Boleh berbeda dari nama peserta"
          style={inputStyle}
        />
      </Field>

      <Field label="No. HP / WhatsApp Penerima" required>
        <input autoComplete="off"
          type="tel"
          required
          value={form.phone}
          onChange={(e) => upd('phone', e.target.value)}
          placeholder="08xx..."
          style={inputStyle}
        />
      </Field>

      <Field label="Email (opsional)">
        <input autoComplete="off"
          type="email"
          value={form.email}
          onChange={(e) => upd('email', e.target.value)}
          placeholder="email@example.com"
          style={inputStyle}
        />
      </Field>

      <Field label="Alamat (Jalan, Nomor, RT/RW)" required>
        <textarea autoComplete="off"
          required
          rows={2}
          value={form.street}
          onChange={(e) => upd('street', e.target.value)}
          placeholder="Misal: Jl. Sudirman No. 123, RT 05/RW 02"
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Kelurahan" required>
          <input autoComplete="off"
            type="text"
            required
            value={form.kelurahan}
            onChange={(e) => upd('kelurahan', e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Kecamatan" required>
          <input autoComplete="off"
            type="text"
            required
            value={form.kecamatan}
            onChange={(e) => upd('kecamatan', e.target.value)}
            style={inputStyle}
          />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Kota / Kabupaten" required>
          <input autoComplete="off"
            type="text"
            required
            value={form.kota}
            onChange={(e) => upd('kota', e.target.value)}
            placeholder="Jakarta Pusat"
            style={inputStyle}
          />
        </Field>
        <Field label="Provinsi" required>
          <input autoComplete="off"
            type="text"
            required
            value={form.provinsi}
            onChange={(e) => upd('provinsi', e.target.value)}
            placeholder="DKI Jakarta"
            style={inputStyle}
          />
        </Field>
      </div>

      <Field label="Kode Pos" required>
        <input autoComplete="off"
          type="text"
          required
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={form.kode_pos}
          onChange={(e) => upd('kode_pos', e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="10220"
          style={{ ...inputStyle, maxWidth: 120 }}
        />
      </Field>

      <Field label="Catatan / Patokan (opsional)">
        <textarea autoComplete="off"
          rows={2}
          value={form.notes}
          onChange={(e) => upd('notes', e.target.value)}
          placeholder="Misal: Rumah cat hijau seberang warung Bu Siti"
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </Field>

      {error && (
        <div style={{
          padding: 12, borderRadius: 8,
          background: '#fef2f2', border: '1px solid #fecaca',
          color: '#991b1b', fontSize: 13
        }}>
          ⚠ {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        style={{
          marginTop: 8,
          padding: '14px 16px',
          background: pending ? '#a78bfa' : 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
          color: 'white',
          border: 'none',
          borderRadius: 10,
          fontSize: 15,
          fontWeight: 'bold',
          cursor: pending ? 'wait' : 'pointer',
          boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)',
        }}
      >
        {pending ? '⏳ Menyimpan...' : '💾 Simpan Alamat'}
      </button>
    </form>
  );
}

function Field({ label, required, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
        {label}{required && <span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>}
      </span>
      {children}
    </label>
  );
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};
