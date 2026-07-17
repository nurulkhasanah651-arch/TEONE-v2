// Trip status configuration — colors + labels + accent for each status

export const STATUS_CFG = {
  'open selling':    { label: 'Open Selling',    bg: 'bg-blue-50',    text: 'text-blue-800',    border: 'border-blue-300',    accent: 'border-l-blue-600' },
  'prepare to sell': { label: 'Prepare to Sell', bg: 'bg-amber-50',   text: 'text-amber-800',   border: 'border-amber-300',   accent: 'border-l-amber-600' },
  'closed selling':  { label: 'Closed Selling',  bg: 'bg-purple-50',  text: 'text-purple-800',  border: 'border-purple-300',  accent: 'border-l-purple-600' },
  'ongoing':         { label: 'Ongoing',         bg: 'bg-orange-50',  text: 'text-orange-800',  border: 'border-orange-300',  accent: 'border-l-orange-600' },
  'completed':       { label: 'Completed',       bg: 'bg-green-50',   text: 'text-green-800',   border: 'border-green-300',   accent: 'border-l-green-600' },
  'cancelled':       { label: 'Cancelled',       bg: 'bg-red-50',     text: 'text-red-800',     border: 'border-red-300',     accent: 'border-l-red-600' },
};

export function statusCfg(status) {
  return STATUS_CFG[status?.toLowerCase()] || STATUS_CFG['open selling'];
}

// Status trip OTOMATIS. Prioritas:
//  1. Cancelled (manual)              -> tetap Cancelled
//  2. Lewat tanggal pulang            -> Completed
//  3. Sudah berangkat, belum pulang   -> Ongoing
//  4. Belum berangkat -> status jualan dari kursi terisi (peserta aktif) vs kuota:
//       - Penuh (sold >= quota)              -> Closed Selling
//       - Di-close manual ('closed selling') -> tetap Closed (walau belum penuh)
//       - Sudah ada peserta                  -> Open Selling
//       - Belum ada peserta                  -> Prepare to Sell
// Pakai trip._soldReal (peserta aktif) kalau ada; fallback kolom sold.
export function effectiveSellingStatus(trip) {
  const s = String(trip?.status || '').toLowerCase().trim();
  if (s === 'cancelled') return 'cancelled';
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); // WIB (UTC+7)
  const ret = trip?.return_date ? String(trip.return_date).slice(0, 10) : null;
  const dep = trip?.departure ? String(trip.departure).slice(0, 10) : null;
  if (ret && ret < today) return 'completed';   // sudah lewat tanggal pulang
  if (dep && dep <= today) return 'ongoing';     // sudah berangkat, belum pulang
  const sold = Number(trip?._soldReal ?? trip?.sold ?? 0);
  const quota = Number(trip?.quota ?? 0);
  if (quota > 0 && sold >= quota) return 'closed selling';
  if (s === 'closed selling') return 'closed selling';
  if (sold > 0) return 'open selling';
  return 'prepare to sell';
}

// Opsi filter status jualan (Master Trip).
export const SELLING_FILTERS = [
  { key: '',                label: 'Semua' },
  { key: 'prepare to sell', label: '🟡 Prepare to Sell' },
  { key: 'open selling',    label: '🔵 Open Selling' },
  { key: 'closed selling',  label: '🟣 Closed Selling' },
];

export const PAYMENT_LABEL = {
  lunas: 'Lunas',
  cicilan: 'Cicilan',
  belum: 'Belum',
};

export function tripChecklist(trip) {
  return [
    { label: 'Tiket', ok: trip.ticket_status === 'confirmed' || trip.ticket_status === 'issued' },
    { label: 'Manifest', ok: trip.manifest === 'ready' },
    { label: 'Roomlist', ok: trip.roomlist === 'ready' },
    { label: 'Visa', ok: trip.visa === 'done' || trip.visa === 'approved' || trip.visa === 'process' },
    { label: 'Lunas', ok: trip.payment === 'lunas' },
    { label: 'Briefing', ok: trip.briefing_tl === 'sudah' },
  ];
}
