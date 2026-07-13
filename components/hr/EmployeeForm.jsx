'use client';

// Round 175: EmployeeForm — + tl_subtype dropdown (in-house vs freelance TL)
// Path: components/hr/EmployeeForm.jsx

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { resolveBrandCodeBrowser } from '@/lib/brand-shared';

function fmtIDR(v) {
  if (v == null || v === '') return '';
  const n = String(v).replace(/[^0-9]/g, '');
  if (!n) return '';
  return Number(n).toLocaleString('id-ID');
}
function parseNum(s) {
  return s == null ? '' : String(s).replace(/[^0-9]/g, '');
}

const EMPLOYMENT_TYPES = [
  { value: 'fulltime',    label: '🏢 Full-time (gaji bulanan)' },
  { value: 'parttime',    label: '⏰ Part-time' },
  { value: 'freelance',   label: '💼 Freelance (per project/hour)' },
  { value: 'tour_leader', label: '✈ Tour Leader (per trip)' },
  { value: 'contract',    label: '📋 Contract' },
];

// R175: TL subtype
const TL_SUBTYPES = [
  { value: 'inhouse',   label: '🏠 In-house (karyawan tetap TEONE)' },
  { value: 'freelance', label: '🌍 Freelance (TL lepas/partner)' },
];

const ROLES = ['owner', 'manager', 'accounting', 'finance', 'ops', 'cs', 'pic', 'tl', 'designer', 'social_media', 'admin', 'other'];

export default function EmployeeForm({ action, employee, submitLabel = 'Simpan', defaultType = '' }) {
  const [isKhasanah, setIsKhasanah] = useState(false);
  useEffect(() => { try { setIsKhasanah((resolveBrandCodeBrowser() || '') === 'khasanah'); } catch {} }, []);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    full_name: employee?.full_name || '',
    nickname: employee?.nickname || '',
    email: employee?.email || '',
    phone: employee?.phone || '',
    whatsapp: employee?.whatsapp || '',
    ktp_number: employee?.ktp_number || '',
    npwp_number: employee?.npwp_number || '',
    address: employee?.address || '',
    birth_date: employee?.birth_date || '',
    gender: employee?.gender || '',
    marital_status: employee?.marital_status || '',
    emergency_contact: employee?.emergency_contact || '',
    employment_type: employee?.employment_type || defaultType || 'fulltime',
    tl_subtype: employee?.tl_subtype || 'inhouse',  // R175
    role: employee?.role || '',
    department: employee?.department || '',
    position: employee?.position || '',
    start_date: employee?.start_date || new Date().toISOString().slice(0, 10),
    end_date: employee?.end_date || '',
    status: employee?.status || 'active',
    base_salary: employee?.base_salary || 0,
    transport_allowance: employee?.transport_allowance || 0,
    meal_allowance: employee?.meal_allowance || 0,
    bpjs_kesehatan_amount: employee?.bpjs_kesehatan_amount || 0,
    bpjs_ketenagakerjaan_amount: employee?.bpjs_ketenagakerjaan_amount || 0,
    per_trip_fee: employee?.per_trip_fee || 0,
    hourly_rate: employee?.hourly_rate || 0,
    bank_name: employee?.bank_name || '',
    bank_account_number: employee?.bank_account_number || '',
    bank_account_holder: employee?.bank_account_holder || '',
    avatar_url: employee?.avatar_url || '',
    fonnte_token: employee?.fonnte_token || '',
    waba_api_key: employee?.waba_api_key || '',
    waba_phone_id: employee?.waba_phone_id || '',
    waba_tpl_invoice: employee?.waba_tpl_invoice || '',
    waba_tpl_konfirmasi: employee?.waba_tpl_konfirmasi || '',
    notes: employee?.notes || '',
  });

  function upd(k, v) { setForm((s) => ({ ...s, [k]: v })); }

  async function handleSubmit(formData) {
    setError(''); setSuccess('');
    startTransition(async () => {
      const result = await action(formData);
      if (result?.error) { setError(result.error); }
      else { setSuccess('✓ Tersimpan'); router.refresh(); }
    });
  }

  // Show compensation fields based on employment type
  const showMonthly = ['fulltime', 'parttime', 'contract'].includes(form.employment_type);
  const showPerTrip = form.employment_type === 'tour_leader';
  const showHourly = form.employment_type === 'freelance';
  const showTLSubtype = form.employment_type === 'tour_leader';  // R175

  return (
    <form action={handleSubmit} className="space-y-4">
      {/* IDENTITAS */}
      <Section title="👤 Identitas">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Nama Lengkap" required>
            <input autoComplete="off" type="text" name="full_name" value={form.full_name} onChange={(e) => upd('full_name', e.target.value)} required className={inputCls} />
          </Field>
          <Field label="Nickname (panggilan)">
            <input autoComplete="off" type="text" name="nickname" value={form.nickname} onChange={(e) => upd('nickname', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Email">
            <input autoComplete="off" type="email" name="email" value={form.email} onChange={(e) => upd('email', e.target.value)} className={inputCls} />
          </Field>
          <Field label="No. HP / WA">
            <input autoComplete="off" type="text" name="phone" value={form.phone} onChange={(e) => upd('phone', e.target.value)} placeholder="08xx..." className={inputCls} />
          </Field>
          <Field label="WhatsApp (kalau beda dari HP)">
            <input autoComplete="off" type="text" name="whatsapp" value={form.whatsapp} onChange={(e) => upd('whatsapp', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Kontak Darurat">
            <input autoComplete="off" type="text" name="emergency_contact" value={form.emergency_contact} onChange={(e) => upd('emergency_contact', e.target.value)} placeholder="Nama + nomor" className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="No. KTP">
            <input autoComplete="off" type="text" name="ktp_number" value={form.ktp_number} onChange={(e) => upd('ktp_number', e.target.value)} className={inputCls} />
          </Field>
          <Field label="NPWP">
            <input autoComplete="off" type="text" name="npwp_number" value={form.npwp_number} onChange={(e) => upd('npwp_number', e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Alamat">
          <textarea autoComplete="off" name="address" rows="2" value={form.address} onChange={(e) => upd('address', e.target.value)} className={inputCls + ' resize-y'} />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Tgl Lahir">
            <input autoComplete="off" type="date" name="birth_date" value={form.birth_date} onChange={(e) => upd('birth_date', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Gender">
            <select name="gender" value={form.gender} onChange={(e) => upd('gender', e.target.value)} className={inputCls}>
              <option value="">— Pilih —</option>
              <option value="male">Laki-laki</option>
              <option value="female">Perempuan</option>
            </select>
          </Field>
          <Field label="Status Pernikahan">
            <select name="marital_status" value={form.marital_status} onChange={(e) => upd('marital_status', e.target.value)} className={inputCls}>
              <option value="">— Pilih —</option>
              <option value="single">Single</option>
              <option value="married">Menikah</option>
              <option value="divorced">Cerai</option>
            </select>
          </Field>
        </div>
      </Section>

      {/* EMPLOYMENT */}
      <Section title="💼 Employment">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Type" required>
            <select name="employment_type" value={form.employment_type} onChange={(e) => upd('employment_type', e.target.value)} required className={inputCls}>
              {EMPLOYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" value={form.status} onChange={(e) => upd('status', e.target.value)} className={inputCls}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="resigned">Resigned</option>
            </select>
          </Field>
        </div>

        {/* R175: TL Subtype dropdown — only show if employment_type='tour_leader' */}
        {showTLSubtype && (
          <div className="bg-pink-50 border border-pink-200 rounded-lg p-3">
            <Field label="Jenis Tour Leader" required>
              <select
                name="tl_subtype"
                value={form.tl_subtype}
                onChange={(e) => upd('tl_subtype', e.target.value)}
                required
                className={inputCls}
              >
                {TL_SUBTYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <p className="text-[11px] text-pink-700 mt-1">
              💡 <b>In-house</b> = karyawan tetap TEONE yg jg jadi TL. <b>Freelance</b> = TL lepas/partner, gak dapat gaji bulanan.
            </p>
          </div>
        )}
        {!showTLSubtype && <input autoComplete="off" type="hidden" name="tl_subtype" value={form.tl_subtype} />}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Role">
            <select name="role" value={form.role} onChange={(e) => upd('role', e.target.value)} className={inputCls}>
              <option value="">— Pilih —</option>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Department">
            <input autoComplete="off" type="text" name="department" value={form.department} onChange={(e) => upd('department', e.target.value)} placeholder="Operations / Sales / Finance / Marketing" className={inputCls} />
          </Field>
          <Field label="Jabatan">
            <input autoComplete="off" type="text" name="position" value={form.position} onChange={(e) => upd('position', e.target.value)} placeholder="Senior CS / Tour Leader Eropa / dll" className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Tgl Mulai Kerja">
            <input autoComplete="off" type="date" name="start_date" value={form.start_date} onChange={(e) => upd('start_date', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Tgl Berakhir (kontrak)">
            <input autoComplete="off" type="date" name="end_date" value={form.end_date} onChange={(e) => upd('end_date', e.target.value)} className={inputCls} />
          </Field>
        </div>
      </Section>

      {/* COMPENSATION */}
      <Section title="💰 Kompensasi">
        {showMonthly && (
          <>
            <p className="text-xs text-slate-500 italic">Gaji bulanan + tunjangan + potongan BPJS</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Gaji Pokok (Rp/bulan)">
                <input autoComplete="off" type="text" inputMode="numeric" name="base_salary" value={fmtIDR(form.base_salary)} onChange={(e) => upd('base_salary', parseNum(e.target.value))} className={inputCls} />
              </Field>
              <Field label="Tunjangan Transport">
                <input autoComplete="off" type="text" inputMode="numeric" name="transport_allowance" value={fmtIDR(form.transport_allowance)} onChange={(e) => upd('transport_allowance', parseNum(e.target.value))} className={inputCls} />
              </Field>
              <Field label="Uang Makan">
                <input autoComplete="off" type="text" inputMode="numeric" name="meal_allowance" value={fmtIDR(form.meal_allowance)} onChange={(e) => upd('meal_allowance', parseNum(e.target.value))} className={inputCls} />
              </Field>
              <Field label="BPJS Kesehatan (potongan/bulan)">
                <input autoComplete="off" type="text" inputMode="numeric" name="bpjs_kesehatan_amount" value={fmtIDR(form.bpjs_kesehatan_amount)} onChange={(e) => upd('bpjs_kesehatan_amount', parseNum(e.target.value))} className={inputCls} />
              </Field>
              <Field label="BPJS Ketenagakerjaan (potongan/bulan)">
                <input autoComplete="off" type="text" inputMode="numeric" name="bpjs_ketenagakerjaan_amount" value={fmtIDR(form.bpjs_ketenagakerjaan_amount)} onChange={(e) => upd('bpjs_ketenagakerjaan_amount', parseNum(e.target.value))} className={inputCls} />
              </Field>
            </div>
          </>
        )}
        {showPerTrip && (
          <>
            <p className="text-xs text-slate-500 italic">Tour Leader dibayar per-trip — fee × jumlah trip yg dikerjakan</p>
            <Field label="Fee per Trip (Rp)">
              <input autoComplete="off" type="text" inputMode="numeric" name="per_trip_fee" value={fmtIDR(form.per_trip_fee)} onChange={(e) => upd('per_trip_fee', parseNum(e.target.value))} className={inputCls} />
            </Field>
            {form.tl_subtype === 'inhouse' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700">
                  💡 TL <b>In-house</b> boleh juga isi gaji pokok di bawah (kalau dapat gaji bulanan + fee per trip).
                </p>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Gaji Pokok (Rp/bulan, opsional)">
                    <input autoComplete="off" type="text" inputMode="numeric" name="base_salary" value={fmtIDR(form.base_salary)} onChange={(e) => upd('base_salary', parseNum(e.target.value))} className={inputCls} />
                  </Field>
                  <Field label="Tunjangan Transport (opsional)">
                    <input autoComplete="off" type="text" inputMode="numeric" name="transport_allowance" value={fmtIDR(form.transport_allowance)} onChange={(e) => upd('transport_allowance', parseNum(e.target.value))} className={inputCls} />
                  </Field>
                </div>
              </div>
            )}
          </>
        )}
        {showHourly && (
          <>
            <p className="text-xs text-slate-500 italic">Freelance dibayar per jam — hourly rate × jam kerja tiap bulan</p>
            <Field label="Hourly Rate (Rp/jam)">
              <input autoComplete="off" type="text" inputMode="numeric" name="hourly_rate" value={fmtIDR(form.hourly_rate)} onChange={(e) => upd('hourly_rate', parseNum(e.target.value))} className={inputCls} />
            </Field>
          </>
        )}
        {/* Hidden inputs untuk field yg gak visible (biar tetep terkirim) */}
        {!showMonthly && !(showPerTrip && form.tl_subtype === 'inhouse') && (
          <>
            <input autoComplete="off" type="hidden" name="base_salary" value={form.base_salary} />
            <input autoComplete="off" type="hidden" name="transport_allowance" value={form.transport_allowance} />
            <input autoComplete="off" type="hidden" name="meal_allowance" value={form.meal_allowance} />
            <input autoComplete="off" type="hidden" name="bpjs_kesehatan_amount" value={form.bpjs_kesehatan_amount} />
            <input autoComplete="off" type="hidden" name="bpjs_ketenagakerjaan_amount" value={form.bpjs_ketenagakerjaan_amount} />
          </>
        )}
        {showPerTrip && form.tl_subtype === 'inhouse' && (
          <>
            <input autoComplete="off" type="hidden" name="meal_allowance" value={form.meal_allowance} />
            <input autoComplete="off" type="hidden" name="bpjs_kesehatan_amount" value={form.bpjs_kesehatan_amount} />
            <input autoComplete="off" type="hidden" name="bpjs_ketenagakerjaan_amount" value={form.bpjs_ketenagakerjaan_amount} />
          </>
        )}
        {!showPerTrip && <input autoComplete="off" type="hidden" name="per_trip_fee" value={form.per_trip_fee} />}
        {!showHourly && <input autoComplete="off" type="hidden" name="hourly_rate" value={form.hourly_rate} />}
      </Section>

      {/* BANK */}
      <Section title="🏦 Rekening Bank (untuk transfer gaji)">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Nama Bank">
            <input autoComplete="off" type="text" name="bank_name" value={form.bank_name} onChange={(e) => upd('bank_name', e.target.value)} placeholder="BCA / Mandiri / BRI" className={inputCls} />
          </Field>
          <Field label="No. Rekening">
            <input autoComplete="off" type="text" name="bank_account_number" value={form.bank_account_number} onChange={(e) => upd('bank_account_number', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Atas Nama">
            <input autoComplete="off" type="text" name="bank_account_holder" value={form.bank_account_holder} onChange={(e) => upd('bank_account_holder', e.target.value)} className={inputCls} />
          </Field>
        </div>
      </Section>

      {/* AVATAR + NOTES */}
      <Section title="📝 Lainnya">
        <Field label="Avatar URL (opsional)">
          <input autoComplete="off" type="text" name="avatar_url" value={form.avatar_url} onChange={(e) => upd('avatar_url', e.target.value)} placeholder="https://..." className={inputCls} />
        </Field>
        <Field label="Token Fonnte (untuk kirim WA — dipakai kalau karyawan ini jadi PIC trip)">
          <input autoComplete="off" type="text" name="fonnte_token" value={form.fonnte_token} onChange={(e) => upd('fonnte_token', e.target.value)} placeholder="Token Fonnte nomor WA PIC ini" className={inputCls} />
        </Field>
        {isKhasanah && (
          <Field label="Phone Number ID WABA (Api.co.id) — nomor WhatsApp PIC ini">
            <input autoComplete="off" type="text" name="waba_phone_id" value={form.waba_phone_id} onChange={(e) => upd('waba_phone_id', e.target.value)} placeholder="mis. cmri403w33p1oucjwffp8ch94" className={inputCls} />
            <p className="text-[11px] text-slate-500 mt-1">Ambil dari Api.co.id → Developers → List Phone Numbers (kolom id, bentuk cmr...). Kalau diisi, kiriman WA trip PIC ini lewat WhatsApp resmi nomor itu + chat masuk ke Inbox. Kosong = manual/Fonnte. Ganti nomor = ganti id ini lalu Simpan.</p>
          </Field>
        )}
        {isKhasanah && (
          <Field label="Nama Template Invoice (Api.co.id) — khusus nomor PIC ini">
            <input autoComplete="off" type="text" name="waba_tpl_invoice" value={form.waba_tpl_invoice} onChange={(e) => upd('waba_tpl_invoice', e.target.value)} placeholder="mis. invoice_khasanah_lia" className={inputCls} />
            <p className="text-[11px] text-slate-500 mt-1">Nama template penagihan invoice yang disetujui di WABA nomor PIC ini. Kosong = pakai default invoice_khasanah. Isi kalau nama template PIC ini beda (Api.co.id butuh nama unik).</p>
          </Field>
        )}
        {isKhasanah && (
          <Field label="Nama Template Konfirmasi/DP (Api.co.id) — khusus nomor PIC ini">
            <input autoComplete="off" type="text" name="waba_tpl_konfirmasi" value={form.waba_tpl_konfirmasi} onChange={(e) => upd('waba_tpl_konfirmasi', e.target.value)} placeholder="mis. konfirmasi_khasanah_lia" className={inputCls} />
            <p className="text-[11px] text-slate-500 mt-1">Nama template konfirmasi pembayaran/DP di WABA nomor PIC ini. Kosong = pakai default konfirmasi_payment_khasanah.</p>
          </Field>
        )}
        <Field label="Catatan">
          <textarea autoComplete="off" name="notes" rows="3" value={form.notes} onChange={(e) => upd('notes', e.target.value)} className={inputCls + ' resize-y'} />
        </Field>
      </Section>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
      {success && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>}

      <div className="sticky bottom-0 py-3 px-2 bg-white/90 backdrop-blur border-t border-slate-200 flex items-center justify-end gap-2 -mx-2">
        <button type="submit" disabled={pending} className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg shadow-card">
          {pending ? '⏳ Menyimpan...' : submitLabel}
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5 space-y-3">
      <p className="text-xs font-bold text-brand-700 uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700 block mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
