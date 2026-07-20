'use client';

// Tombol Download Manifest (PDF) — bentuk HORIZONTAL (landscape A4), muat 1 lembar,
// gaya sama seperti Roomlist PDF. Ambil data via getManifestRows, render pakai
// downloadManifestPDF. Cukup kasih prop tripId.
import { useState } from 'react';
import { getManifestRows } from '@/lib/actions/manifest';
import { downloadManifestPDF } from '@/lib/utils/manifest-pdf';

export default function ManifestPdfButton({ tripId, label = '📋 Manifest PDF', className = '' }) {
  const [loading, setLoading] = useState(false);

  async function handle() {
    setLoading(true);
    try {
      const res = await getManifestRows(tripId);
      if (res?.error) { alert('Gagal: ' + res.error); return; }
      const { trip, rows } = res;
      // Urutan kolom DISAMAKAN dgn manifest-pdf.js:
      // No., First Name, Last Name, Gender, Tempat Lahir, Tgl Lahir, Umur,
      // No. Paspor, Tgl Issue, Issuing Office, Tgl Expired, No. HP, Catatan/Request
      const pdfRows = (rows || []).map((r) => [
        r.no, r.first_name, r.last_name, r.gender, r.place_of_birth, r.birth_date, r.age,
        r.passport_no, r.issue_date, r.issuing_office, r.expiry_date, r.phone, r.catatan || '',
      ]);
      await downloadManifestPDF({ trip, rows: pdfRows });
    } catch (e) {
      alert('Gagal download: ' + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={loading}
      className={className || 'px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded disabled:opacity-50'}
    >
      {loading ? 'Menyiapkan…' : label}
    </button>
  );
}
