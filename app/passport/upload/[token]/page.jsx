// PUBLIC — halaman upload paspor via link bertoken (tanpa login).
// Aman: file ke bucket privat; akses dibatasi token per kepala keluarga/solo.
import { getPassportUploadContext } from '@/lib/actions/passport-upload';
import PassportPublicUploadClient from '@/components/passport/PassportPublicUploadClient';

export const dynamic = 'force-dynamic';

export default async function PassportUploadPage({ params }) {
  const { token } = await params;
  const ctx = await getPassportUploadContext(token);

  if (!ctx?.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md w-full bg-white rounded-2xl shadow p-6 text-center">
          <p className="text-4xl mb-3">🔒</p>
          <p className="text-lg font-bold text-slate-800">Link tidak valid</p>
          <p className="text-sm text-slate-500 mt-1">{ctx?.error || 'Link upload paspor ini tidak ditemukan atau sudah kedaluwarsa. Hubungi CS kami ya.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-5">
          <p className="text-3xl">🛂</p>
          <h1 className="text-xl font-bold text-slate-800 mt-1">Upload Paspor</h1>
          <p className="text-sm text-slate-500 mt-1">{ctx.tripName}</p>
        </div>
        <PassportPublicUploadClient token={token} members={ctx.members} />
        <p className="text-center text-[11px] text-slate-400 mt-6">Data Anda aman & hanya dipakai untuk pengurusan dokumen trip 🙏</p>
      </div>
    </div>
  );
}
