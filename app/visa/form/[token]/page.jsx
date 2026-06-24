// PUBLIC — halaman isi Form Tambahan Visa via link bertoken (tanpa login).
import { getVisaFormContext } from '@/lib/actions/visa-form';
import { getVisaForm } from '@/lib/utils/visa-form-defs';
import VisaFormPublicClient from '@/components/visa/VisaFormPublicClient';

export const dynamic = 'force-dynamic';

export default async function VisaFormPage({ params }) {
  const { token } = await params;
  const ctx = await getVisaFormContext(token);

  if (!ctx?.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md w-full bg-white rounded-2xl shadow p-6 text-center">
          <p className="text-4xl mb-3">🔒</p>
          <p className="text-lg font-bold text-slate-800">Link tidak valid</p>
          <p className="text-sm text-slate-500 mt-1">{ctx?.error || 'Link form ini tidak ditemukan atau sudah kedaluwarsa. Hubungi tim Visa kami ya.'}</p>
        </div>
      </div>
    );
  }

  const form = getVisaForm(ctx.formType);

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-5">
          <p className="text-3xl">📝</p>
          <h1 className="text-xl font-bold text-slate-800 mt-1">Formulir Aplikasi Visa</h1>
          <p className="text-sm text-brand-700 font-semibold mt-0.5">{ctx.formLabel}</p>
          <p className="text-xs text-slate-500 mt-1">{ctx.tripName}</p>
          {form?.note && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-3">{form.note}</p>}
        </div>
        <VisaFormPublicClient token={token} formType={ctx.formType} sections={form?.sections || []} members={ctx.members} />
        <p className="text-center text-[11px] text-slate-400 mt-6">Data Anda aman & hanya dipakai untuk pengurusan visa 🙏</p>
      </div>
    </div>
  );
}
