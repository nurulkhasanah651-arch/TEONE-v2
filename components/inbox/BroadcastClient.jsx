'use client';

// Broadcast WABA + Template Manager (Khasanah).
import { useState, useTransition } from 'react';
import { previewBroadcastAudience, sendBroadcast, sendPicWabaBroadcast } from '@/lib/actions/wa-blast';
import { createBlastUploadUrl } from '@/lib/actions/blast';

const PIC_BROADCAST_KINDS = [
  { kind: 'waba_perubahan_jadwal', label: '📅 Info Perubahan Jadwal', needsSchedule: true },
  { kind: 'waba_finalisasi_tiket', label: '🎫 Info Finalisasi Tiket', needsSchedule: false },
];

// Template SIAP DAFTAR ke Meta WhatsApp Manager (belum tentu sudah Approved).
// Setelah di-approve di Meta, otomatis muncul di daftar template atas & bisa dikirim.
const WABA_TEMPLATE_DRAFTS = [
  {
    name: 'info_perubahan_jadwal',
    category: 'UTILITY',
    language: 'Indonesian (id)',
    vars: '{{1}} = nama · {{2}} = jadwal semula · {{3}} = jadwal terbaru · {{4}} = link itinerary',
    body: `Halo Kak {{1}} 🙏

Dengan hormat, kami menginformasikan adanya perubahan jadwal penerbangan dari pihak maskapai untuk keberangkatan Kakak.

Jadwal semula: {{2}}
Jadwal terbaru: {{3}}

Perubahan ini tidak mengubah susunan itinerary sama sekali — seluruh agenda perjalanan tetap berjalan sesuai rencana semula.

Detail itinerary terbaru dapat Kakak akses di tautan berikut: {{4}}

Terima kasih atas perhatian Kakak 🙏`,
    footer: 'Tim Traveling Eropa & Khasanah Travel',
    samples: ['Budi', '12 Okt – 18 Okt 2026', '13 Okt – 19 Okt 2026', 'https://travelingeropa.com/doc/itinerary.pdf'],
  },
  {
    name: 'info_finalisasi_tiket',
    category: 'UTILITY',
    language: 'Indonesian (id)',
    vars: '{{1}} = nama',
    body: `Halo Kak {{1}} 🙏

Izin menginformasikan, saat ini kami sedang memasuki tahap finalisasi dan penerbitan (issued) tiket penerbangan untuk keberangkatan Kakak.

Dengan melanjutkan proses ini, Kakak dianggap telah menyetujui syarat & ketentuan yang berlaku:

1. Tiket bersifat NON-REFUND dalam kondisi apa pun.
2. Nama pada tiket tidak dapat diubah (no change name).

Mohon konfirmasi kesediaan Kakak agar dapat kami lanjutkan ke proses issued tiket. Terima kasih atas kepercayaan & kerja samanya 🙏`,
    footer: 'Tim Traveling Eropa & Khasanah Travel',
    samples: ['Budi'],
  },
];

export default function BroadcastClient({ initial }) {
  const [tab, setTab] = useState('pic');
  const numbers = initial?.numbers || [];
  const trips = initial?.trips || [];
  const templates = initial?.templates || [];
  const tplError = initial?.tplError;

  const [numberId, setNumberId] = useState(numbers[0]?.id || '');
  const [tripId, setTripId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [extra, setExtra] = useState('');
  const [audience, setAudience] = useState(null);
  const [result, setResult] = useState(null);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [docLink, setDocLink] = useState('');
  const [copied, setCopied] = useState('');
  // Tab "Kirim via PIC" (Api.co.id per-PIC, pakai nama template dari HR)
  const [picTrip, setPicTrip] = useState('');
  const [picKind, setPicKind] = useState('waba_perubahan_jadwal');
  const [jadwalLama, setJadwalLama] = useState('');
  const [jadwalBaru, setJadwalBaru] = useState('');
  const [picAudience, setPicAudience] = useState(null);
  const [picResult, setPicResult] = useState(null);

  function checkPicAudience(tid) {
    setPicTrip(tid); setPicAudience(null); setPicResult(null);
    if (!tid) return;
    start(async () => { const r = await previewBroadcastAudience(tid); if (r?.ok) setPicAudience(r); });
  }
  function kirimPic() {
    if (!picTrip || !picKind) { alert('Pilih trip & jenis broadcast'); return; }
    const meta = PIC_BROADCAST_KINDS.find((k) => k.kind === picKind);
    const extraParams = meta?.needsSchedule ? [jadwalLama, jadwalBaru, docLink] : [];
    if (!confirm(`Kirim "${meta?.label}" ke ${picAudience?.count || '?'} peserta dari nomor PIC trip?`)) return;
    setPicResult(null);
    start(async () => {
      const r = await sendPicWabaBroadcast({ tripId: picTrip, kind: picKind, extraParams });
      if (r?.error) { alert(r.error); return; }
      setPicResult(r);
    });
  }

  function copy(text, key) {
    try { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1500); } catch {}
  }

  async function onUploadItinerary(e) {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 26214400) { alert('File maksimal 25MB.'); return; }
    setUploading(true);
    try {
      const init = await createBlastUploadUrl(file.name);
      if (!init?.ok) { alert(init?.error || 'Gagal menyiapkan upload.'); setUploading(false); return; }
      const up = await fetch(init.signedUrl, { method: 'PUT', headers: { 'content-type': file.type || 'application/octet-stream', 'x-upsert': 'true' }, body: file });
      if (!up.ok) { alert('Upload gagal (' + up.status + ').'); setUploading(false); return; }
      setDocLink(init.publicUrl || '');
    } catch (e2) { alert(e2?.message || 'Upload gagal.'); }
    setUploading(false);
  }

  function checkAudience(tid) {
    setTripId(tid); setAudience(null); setResult(null);
    if (!tid) return;
    start(async () => { const r = await previewBroadcastAudience(tid); if (r?.ok) setAudience(r); });
  }
  function kirim() {
    if (!numberId || !tripId || !templateName) { alert('Lengkapi nomor, trip, dan template'); return; }
    if (!confirm(`Kirim broadcast template "${templateName}" ke ${audience?.count || '?'} peserta?`)) return;
    const extraParams = extra.split('|').map((x) => x.trim()).filter(Boolean);
    setResult(null);
    start(async () => {
      const r = await sendBroadcast({ numberId: Number(numberId), tripId, templateName, extraParams });
      if (r?.error) { alert(r.error); return; }
      setResult(r);
    });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-brand-700">📣 Broadcast WhatsApp (WABA)</h1>
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setTab('pic')} className={`px-3 py-1.5 text-sm font-bold rounded ${tab === 'pic' ? 'bg-brand-500 text-white' : 'bg-slate-100'}`}>Kirim via Nomor PIC</button>
        <button onClick={() => setTab('kirim')} className={`px-3 py-1.5 text-sm font-bold rounded ${tab === 'kirim' ? 'bg-brand-500 text-white' : 'bg-slate-100'}`}>Kirim (Meta)</button>
        <button onClick={() => setTab('template')} className={`px-3 py-1.5 text-sm font-bold rounded ${tab === 'template' ? 'bg-brand-500 text-white' : 'bg-slate-100'}`}>Template ({templates.length})</button>
      </div>

      {tab === 'pic' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 shadow-card">
          <p className="text-[12px] text-slate-600 bg-indigo-50 border border-indigo-200 rounded-lg p-2.5">
            Broadcast ini dikirim dari <b>nomor WABA PIC trip</b> (Api.co.id) memakai <b>nama template yang diisi di HR</b> masing-masing PIC. Pastikan template sudah <b>Approved</b> di WABA & nama template PIC sudah diisi di menu HR.
          </p>
          <label className="block"><span className="text-xs font-bold text-slate-600">Ke peserta trip</span>
            <select value={picTrip} onChange={(e) => checkPicAudience(e.target.value)} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm">
              <option value="">— Pilih trip —</option>
              {trips.map((t) => <option key={t.id} value={t.id}>{t.kode_trip} — {t.name}</option>)}
            </select>
          </label>
          {picAudience && <p className="text-xs text-slate-600">👥 {picAudience.count} peserta punya nomor{picAudience.recipients?.length ? ` (mis. ${picAudience.recipients.join(', ')})` : ''}</p>}
          <label className="block"><span className="text-xs font-bold text-slate-600">Jenis broadcast</span>
            <select value={picKind} onChange={(e) => { setPicKind(e.target.value); setPicResult(null); }} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm">
              {PIC_BROADCAST_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
            </select>
          </label>
          {PIC_BROADCAST_KINDS.find((k) => k.kind === picKind)?.needsSchedule && (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Isi jadwal ({'{{2}}'}, {'{{3}}'}) & link itinerary ({'{{4}}'})</p>
              <label className="block"><span className="text-[11px] text-slate-500">Jadwal semula</span>
                <input value={jadwalLama} onChange={(e) => setJadwalLama(e.target.value)} placeholder="mis. 12 Okt – 18 Okt 2026" className="w-full mt-0.5 px-3 py-2 border border-slate-300 rounded-lg text-sm" /></label>
              <label className="block"><span className="text-[11px] text-slate-500">Jadwal terbaru</span>
                <input value={jadwalBaru} onChange={(e) => setJadwalBaru(e.target.value)} placeholder="mis. 13 Okt – 19 Okt 2026" className="w-full mt-0.5 px-3 py-2 border border-slate-300 rounded-lg text-sm" /></label>
              <div>
                <span className="text-[11px] text-slate-500">Link itinerary</span>
                {docLink ? (
                  <div className="flex items-center gap-2 text-xs mt-0.5">
                    <input readOnly value={docLink} className="flex-1 px-2 py-1.5 border border-slate-300 rounded bg-white text-slate-700" />
                    <button type="button" onClick={() => setDocLink('')} className="text-rose-600 hover:underline shrink-0">Hapus</button>
                  </div>
                ) : (
                  <label className="mt-0.5 inline-flex items-center gap-2 text-sm cursor-pointer text-indigo-600 hover:underline">
                    <input type="file" accept=".pdf,image/*" onChange={onUploadItinerary} className="hidden" />
                    {uploading ? 'Mengunggah…' : '+ Upload PDF / gambar itinerary'}
                  </label>
                )}
              </div>
            </div>
          )}
          <button onClick={kirimPic} disabled={pending || !picTrip} className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg disabled:opacity-50">
            {pending ? 'Mengirim…' : `📤 Kirim ke ${picAudience?.count || 0} peserta (dari nomor PIC)`}
          </button>
          {picResult && (
            <div className="text-sm bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              ✅ Terkirim {picResult.sent}/{picResult.total}{picResult.failed ? ` · ${picResult.failed} gagal` : ''}{picResult.noPic ? ` · ${picResult.noPic} lewat (PIC tanpa nomor WABA)` : ''}
              {picResult.errors?.length > 0 && <ul className="mt-1 text-[11px] text-red-600 list-disc pl-4">{picResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
            </div>
          )}
        </div>
      )}

      {tab === 'kirim' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 shadow-card">
          {numbers.length === 0 && <p className="text-sm text-amber-700">Belum ada nomor WABA yang bisa kamu pakai. Isi Meta Phone Number ID di HR dulu.</p>}
          <label className="block"><span className="text-xs font-bold text-slate-600">Kirim dari nomor</span>
            <select value={numberId} onChange={(e) => setNumberId(e.target.value)} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm">
              {numbers.map((n) => <option key={n.id} value={n.id}>{n.pic_name || n.display_phone || n.phone_number_id}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Ke peserta trip</span>
            <select value={tripId} onChange={(e) => checkAudience(e.target.value)} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm">
              <option value="">— Pilih trip —</option>
              {trips.map((t) => <option key={t.id} value={t.id}>{t.kode_trip} — {t.name}</option>)}
            </select>
          </label>
          {audience && <p className="text-xs text-slate-600">👥 {audience.count} peserta punya nomor{audience.recipients?.length ? ` (mis. ${audience.recipients.join(', ')})` : ''}</p>}
          <label className="block"><span className="text-xs font-bold text-slate-600">Template</span>
            {tplError ? <p className="text-xs text-red-600 mt-1">{tplError}</p> : (
              <select value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm">
                <option value="">— Pilih template —</option>
                {templates.map((t) => <option key={t.id || t.name} value={t.name}>{t.name} ({t.language})</option>)}
              </select>
            )}
          </label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Variabel tambahan (opsional)</span>
            <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="var2 | var3 | var4 (var1 = nama otomatis)" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <span className="text-[11px] text-slate-500">{'{{1}}'} otomatis nama peserta. Pisahkan variabel berikutnya dengan tanda <b>|</b>. Contoh <i>info_perubahan_jadwal</i>: <code className="bg-slate-100 px-1 rounded">12 Okt – 18 Okt | 13 Okt – 19 Okt | (link itinerary)</code></span>
          </label>

          {/* Upload itinerary -> link (utk variabel link, mis. {{4}} di info_perubahan_jadwal) */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Upload itinerary → dapat link (opsional)</p>
            {docLink ? (
              <div className="flex items-center gap-2 text-xs">
                <input readOnly value={docLink} className="flex-1 px-2 py-1.5 border border-slate-300 rounded bg-white text-slate-700" />
                <button type="button" onClick={() => copy(docLink, 'link')} className="px-2 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold shrink-0">{copied === 'link' ? '✓ Tersalin' : 'Copy link'}</button>
                <button type="button" onClick={() => setDocLink('')} className="text-rose-600 hover:underline shrink-0">Hapus</button>
              </div>
            ) : (
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer text-indigo-600 hover:underline">
                <input type="file" accept=".pdf,image/*" onChange={onUploadItinerary} className="hidden" />
                {uploading ? 'Mengunggah…' : '+ Upload PDF / gambar itinerary'}
              </label>
            )}
            <p className="text-[10px] text-slate-400 mt-1">Copy link-nya, lalu tempel sebagai variabel link di kolom "Variabel tambahan" di atas. Maks 25MB.</p>
          </div>
          <button onClick={kirim} disabled={pending || !templateName || !tripId} className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg disabled:opacity-50">
            {pending ? 'Mengirim…' : `📤 Kirim ke ${audience?.count || 0} peserta`}
          </button>
          {result && (
            <div className="text-sm bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              ✅ Terkirim {result.sent}/{result.total}{result.failed ? ` · ${result.failed} gagal` : ''}
              {result.errors?.length > 0 && <ul className="mt-1 text-[11px] text-red-600 list-disc pl-4">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
            </div>
          )}
        </div>
      )}

      {tab === 'template' && (
        <div className="space-y-4">
          {/* Template siap daftar ke Meta (copy-paste) */}
          <div className="bg-white rounded-xl border-2 border-indigo-200 shadow-card overflow-hidden">
            <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-200">
              <p className="font-bold text-indigo-800 text-sm">📋 Template Siap Daftar ke Meta</p>
              <p className="text-[11px] text-slate-600">Copy body-nya, daftarkan di Meta WhatsApp Manager → Create Template. Setelah <b>Approved</b>, otomatis muncul di daftar bawah &amp; bisa dikirim.</p>
            </div>
            <div className="divide-y divide-slate-100">
              {WABA_TEMPLATE_DRAFTS.map((t) => (
                <div key={t.name} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-sm font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{t.name}</code>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">{t.category}</span>
                      <span className="text-[10px] text-slate-500">{t.language}</span>
                    </div>
                    <button type="button" onClick={() => copy(t.body, t.name)} className="text-xs px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold">{copied === t.name ? '✓ Tersalin' : 'Copy body'}</button>
                  </div>
                  <p className="text-[11px] text-slate-500">Variabel: {t.vars}</p>
                  <pre className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-3 whitespace-pre-wrap font-sans">{t.body}</pre>
                  <p className="text-[11px] text-slate-500">Footer: <span className="text-slate-700">{t.footer}</span> · Contoh sample: {t.samples.map((s, i) => `{{${i + 1}}}=${s}`).join(' · ')}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Daftar template yg SUDAH approved di Meta */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
          <p className="px-4 py-2 text-xs font-bold text-slate-600 border-b border-slate-100 bg-slate-50">Template Approved di Meta ({templates.length})</p>
          {tplError ? <p className="p-5 text-sm text-red-600">{tplError}</p> : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase"><tr><th className="px-4 py-2">Nama</th><th className="px-4 py-2">Kategori</th><th className="px-4 py-2">Bahasa</th><th className="px-4 py-2">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {templates.map((t) => (
                  <tr key={t.id || t.name}><td className="px-4 py-2 font-semibold">{t.name}</td><td className="px-4 py-2">{t.category}</td><td className="px-4 py-2">{t.language}</td><td className="px-4 py-2"><span className="text-[11px] px-2 py-0.5 rounded bg-green-100 text-green-700 font-bold">{t.status}</span></td></tr>
                ))}
                {templates.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Tidak ada template approved.</td></tr>}
              </tbody>
            </table>
          )}
          <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100">Template dibuat &amp; di-approve di Meta WhatsApp Manager. Di sini hanya menampilkan yang sudah Approved.</p>
          </div>
        </div>
      )}
    </div>
  );
}
