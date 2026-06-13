// R215p: PUBLIC upload portal — peserta upload dokumen via token
// Path: app/visa/upload/[token]/page.jsx
//
// IMPORTANT: Page ini di LUAR route group (app), jadi gak butuh auth
// Akses via link yg dikirim WA: https://teone.dev/visa/upload/vsa_XXXXX

import { lookupVisaByToken } from '@/lib/actions/visa-public-upload';
import VisaPublicUploadClient from '@/components/visa/VisaPublicUploadClient';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function VisaUploadPortalPage({ params }) {
  const { token } = await params;
  const r = await lookupVisaByToken(token);

  if (r?.error || !r?.ok) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-card p-8 text-center">
          <p className="text-5xl mb-3">⚠</p>
          <h1 className="text-2xl font-bold text-red-700 mb-2">Link Tidak Valid</h1>
          <p className="text-sm text-slate-600">
            {r?.error || 'Link upload visa Kaka tidak valid atau sudah expired.'}
          </p>
          <p className="mt-4 text-xs text-slate-500">
            Mohon hubungi tim visa Traveling Eropa untuk dapatkan link baru:
            <br />📞 +62 813 6411 3535
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-cyan-50">
      <div className="max-w-3xl mx-auto p-4 md:p-8">
        <div className="bg-white rounded-2xl shadow-card overflow-hidden">
          {/* Header */}
          <div className="px-6 py-5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white">
            <div className="flex items-center gap-3">
              <div className="text-3xl">🛂</div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold">Upload Dokumen Visa</h1>
                <p className="text-xs md:text-sm text-cyan-100">Traveling Eropa</p>
              </div>
            </div>
          </div>

          {/* Pass to client component for upload UI */}
          <VisaPublicUploadClient
            token={token}
            passenger={r.passenger}
            trip={r.trip}
            customer={r.customer}
            members={r.members || []}
            isFamily={!!r.is_family}
          />
        </div>

        <div className="text-center mt-4 text-xs text-slate-500">
          <p>Butuh bantuan? Chat WA: <a href="https://wa.me/6281364113535" className="text-cyan-700 font-semibold">+62 813 6411 3535</a></p>
          <p className="mt-1">© Traveling Eropa · www.travelingeropa.id</p>
        </div>
      </div>
    </div>
  );
}
