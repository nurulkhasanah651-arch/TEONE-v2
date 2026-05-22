// /visa/export.csv?month=YYYY-MM
// Aggregate semua trip dengan status visa per peserta

import { createClient } from '@/lib/supabase/server';
import { buildCsv, csvResponse, buildFilename } from '@/lib/utils/csv-export';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const url = new URL(req.url);
  const month = url.searchParams.get('month') || 'all';
  const supabase = createClient();

  // Trips for context
  let { data: trips } = await supabase.from('trips').select('*');
  trips = trips || [];
  const tripMap = Object.fromEntries(trips.map((t) => [t.id, t]));

  // Filter trips by departure month
  let activeTripIds = trips.map((t) => t.id);
  if (month !== 'all') {
    activeTripIds = trips.filter((t) => (t.departure || '').startsWith(month)).map((t) => t.id);
  }

  const { data: passengers } = await supabase.from('trip_passengers').select('*').in('trip_id', activeTripIds);
  const customerIds = (passengers || []).map((p) => p.customer_id).filter(Boolean);
  const { data: customers } = customerIds.length > 0
    ? await supabase.from('customers').select('*').in('id', customerIds)
    : { data: [] };
  const custMap = Object.fromEntries((customers || []).map((c) => [c.id, c]));

  const rows = (passengers || []).map((p) => {
    const t = tripMap[p.trip_id] || {};
    const c = custMap[p.customer_id] || {};
    const docs = Array.isArray(p.visa_docs) ? p.visa_docs : [];
    const complete = docs.filter((d) => d.complete).length;
    const total = (t.visa_doc_template || []).length;
    return {
      trip_kode: t.kode_trip || p.trip_id,
      trip_name: t.name || '',
      visa_country: t.visa_country || '',
      pax_name: c.name || '',
      passport_no: c.passport_no || '',
      passport_expiry: c.passport_expiry || '',
      room_type: p.room_type || '',
      visa_status: p.visa_status || 'pending',
      visa_biometric_date: p.visa_biometric_date || '',
      docs_complete: total > 0 ? `${complete}/${total}` : '',
      missing_docs: (t.visa_doc_template || []).filter((dn) => !docs.find((d) => d.name === dn && d.complete)).join('; '),
      visa_personal_notes: p.visa_personal_notes || '',
    };
  });

  const headers = [
    { key: 'trip_kode', label: 'Kode Trip' },
    { key: 'trip_name', label: 'Nama Trip' },
    { key: 'visa_country', label: 'Negara Visa' },
    { key: 'pax_name', label: 'Peserta' },
    { key: 'passport_no', label: 'Passport No' },
    { key: 'passport_expiry', label: 'Passport Expiry' },
    { key: 'room_type', label: 'Room Type' },
    { key: 'visa_status', label: 'Status Visa' },
    { key: 'visa_biometric_date', label: 'Tgl Biometrik' },
    { key: 'docs_complete', label: 'Dokumen Lengkap' },
    { key: 'missing_docs', label: 'Dokumen Kurang' },
    { key: 'visa_personal_notes', label: 'Notes' },
  ];

  return csvResponse(buildCsv(rows, headers), buildFilename('visa_report', month));
}
