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
