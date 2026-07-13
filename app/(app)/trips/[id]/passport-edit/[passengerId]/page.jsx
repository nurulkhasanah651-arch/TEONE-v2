// Round 141 HOTFIX: Passport edit page — pakai 2 query terpisah
// Path: app/(app)/trips/[id]/passport-edit/[passengerId]/page.jsx

import { createClient } from '@/lib/supabase/server';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import EditPassportClient from './EditPassportClient';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const dynamic = 'force-dynamic';

export default async function EditPassportPage({ params }) {
  const { id: tripId, passengerId } = await params;

  const supabase = getServiceClient() || createClient();

  // QUERY 1: ambil trip_passenger (tanpa nested customers)
  const { data: pax } = await supabase
    .from('trip_passengers')
    .select('*')
    .eq('id', passengerId)
    .maybeSingle();

  if (!pax) {
    redirect(`/trips/${tripId}`);
  }

  // QUERY 2: ambil customer separately
  let c = {};
  if (pax.customer_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('id', pax.customer_id)
      .maybeSingle();
    c = customer || {};
  }

  const initialData = {
    first_name: c.first_name || '',
    last_name: c.surname || '',
    city: c.city || '',
    birthday: c.birthday || '',
    gender: c.gender || '',
    phone: c.phone || c.whatsapp || '',
    email: c.email || '',
    passport_no: c.passport_no || '',
    passport_issued_at: c.passport_issued_at || '',
    passport_issued_date: c.passport_issued_date || '',
    passport_expiry: c.passport_expiry || '',
    passport_photo_url: c.passport_photo_url || '',
    nationality: c.nationality || '',
    room_type: pax.room_type || '',
    price_paid: pax.price_paid || '',
  };

  const fullName = `${initialData.first_name} ${initialData.last_name}`.trim() || c.name || `Peserta #${passengerId}`;

  // Dokumen tambahan (endorse/lainnya) -> signed URL utk didownload kantor
  let extraDocs = [];
  try {
    const arr = Array.isArray(pax.passport_extra_paths) ? pax.passport_extra_paths : [];
    for (const it of arr) {
      if (!it?.path) continue;
      const { data: sg } = await supabase.storage.from('passport-uploads').createSignedUrl(it.path, 3600);
      if (sg?.signedUrl) extraDocs.push({ label: it.label || 'Dokumen', url: sg.signedUrl });
    }
  } catch {}

  return (
    <div className="space-y-4">
      {extraDocs.length > 0 && (
        <div className="max-w-2xl mx-auto bg-white rounded-xl border border-indigo-200 p-4">
          <p className="text-sm font-bold text-indigo-700 mb-2">Dokumen tambahan ({extraDocs.length})</p>
          <div className="flex flex-wrap gap-2">
            {extraDocs.map((d, i) => (
              <a key={i} href={d.url} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 rounded bg-indigo-50 text-indigo-700 font-semibold hover:bg-indigo-100">📎 {d.label} — buka/unduh</a>
            ))}
          </div>
        </div>
      )}
      <EditPassportClient
        tripId={tripId}
        passengerId={passengerId}
        customerId={pax.customer_id}
        initial={initialData}
        paxFullName={fullName}
      />
    </div>
  );
}
