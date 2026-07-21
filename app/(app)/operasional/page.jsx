// Tab Operasional — Proyeksi Income per Group + PNR Inventory.
// Path: app/(app)/operasional/page.jsx
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function OperasionalPage() {
  const supabase = createClient();
  const [itemsRes, pnrRes] = await Promise.all([
    supabase.from('trip_finance_items').select('id', { count: 'exact', head: true }),
    supabase.from('flight_inventory').select('id', { count: 'exact', head: true }),
  ]);
  const totalItems = itemsRes.count ?? 0;
  const totalPNR = pnrRes.count ?? 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">Operasional</h1>
        <p className="mt-1 text-slate-600">Proyeksi income per group & inventory tiket (PNR).</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard
          href="/finance/cashflow"
          icon="💰"
          title="Proyeksi Income per Group"
          desc="Auto income (peserta × breakdown) + HPP per kategori (tiket, hotel, LA, transport, visa, dll). Per item ada DP/Total/Sisa + Request Payment."
          badge={`${totalItems} item HPP/income`}
          color="from-green-500 to-emerald-700"
        />
        <SectionCard
          href="/finance/pnr"
          icon="✈"
          title="PNR Inventory"
          desc="Deposit maskapai, harga tiket, vendor, deadline pelunasan. Auto-sync ke HPP."
          badge={`${totalPNR} PNR`}
          color="from-amber-500 to-orange-700"
        />
        <SectionCard
          href="/operasional/tour-confirmation"
          icon="📄"
          title="Tour Confirmation"
          desc="TC per trip: info group, meeting point, detail flight, itinerary (dari web, bisa diedit) + nama & alamat hotel. Download PDF atau kirim ke peserta dari nomor PIC."
          badge="TC per trip"
          color="from-sky-500 to-blue-700"
        />
      </div>
    </div>
  );
}

function SectionCard({ href, icon, title, desc, badge, color }) {
  return (
    <Link href={href} className="group block rounded-2xl border border-slate-200 shadow-card overflow-hidden hover:shadow-lg transition-shadow bg-white">
      <div className={`h-1.5 bg-gradient-to-r ${color}`} />
      <div className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-3xl">{icon}</span>
          {badge && <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-600">{badge}</span>}
        </div>
        <h2 className="mt-3 font-bold text-slate-800 group-hover:text-brand-700">{title}</h2>
        <p className="mt-1 text-xs text-slate-500 leading-relaxed">{desc}</p>
      </div>
    </Link>
  );
}
