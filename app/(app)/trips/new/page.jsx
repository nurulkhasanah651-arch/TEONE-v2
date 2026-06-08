// New Trip page — Round 72: fetch tourLeaders + pnrInventory

import Link from 'next/link';
import TripForm from '@/components/trips/TripForm';
import { createTrip } from '../actions';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function fetchEmployees(supabase) {
  try {
    // PIC dipilih dari akun yang sudah login (tabel users), bukan data karyawan.
    // Hanya role internal yang relevan jadi PIC.
    const { data } = await supabase
      .from('users')
      .select('id, name, email, role')
      .in('role', ['pic', 'ops', 'cs', 'manager', 'team', 'finance', 'owner'])
      .order('name');
    return (Array.isArray(data) ? data : []).map((u) => ({
      id: u.id,
      full_name: u.name || (u.email ? u.email.split('@')[0] : 'User'),
      email: u.email,
      role: u.role,
    }));
  } catch {
    return [];
  }
}

async function fetchTourLeaders(supabase) {
  try {
    const { data } = await supabase
      .from('tour_leaders')
      .select('*')
      .eq('active', true)
      .order('name');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function fetchPnrInventory(supabase) {
  try {
    const { data } = await supabase
      .from('flight_inventory')
      .select('*')
      .order('pnr');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export default async function NewTripPage() {
  const supabase = createClient();
  const [tourLeaders, pnrInventory, employees] = await Promise.all([
    fetchTourLeaders(supabase),
    fetchPnrInventory(supabase),
    fetchEmployees(supabase),
  ]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/trips" className="text-sm text-brand-600 font-medium hover:underline">← Kembali ke list</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">Buat Trip Baru</h1>
        <p className="mt-1 text-slate-600">Isi info dasar trip — bisa di-edit kapan saja nanti.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6">
        <TripForm
          onSubmit={createTrip}
          submitLabel="Buat Trip"
          tourLeaders={tourLeaders}
          pnrInventory={pnrInventory}
          employees={employees}
        />
      </div>
    </div>
  );
}
