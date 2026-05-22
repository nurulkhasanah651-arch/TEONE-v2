// Helper untuk priority sorting trip — push selling logic
import { daysUntil } from './format';

// Score lebih tinggi = lebih prioritas untuk di-push
// Sort desc → trip yang butuh perhatian paling tinggi muncul atas
export function priorityScore(trip) {
  if (!trip) return -9999;

  // Completed/cancelled paling bawah
  if (trip.status === 'completed') return -1000;
  if (trip.status === 'cancelled') return -2000;
  // Sudah closed selling = ga perlu push
  if (trip.status === 'closed selling') return -100;

  let score = 100;

  // Status open selling = base prioritas
  if (trip.status === 'open selling') score += 50;
  if (trip.status === 'prepare to sell') score += 10;
  if (trip.status === 'ongoing') score += 30;

  // Days to departure
  const days = daysUntil(trip.departure);
  if (days != null && days >= 0) {
    if (days <= 7)  score += 200;
    else if (days <= 14) score += 120;
    else if (days <= 30) score += 60;
    else if (days <= 60) score += 30;
    else if (days <= 90) score += 10;
  }

  // Days to deadline_close
  const dDeadline = daysUntil(trip.deadline_close);
  if (dDeadline != null && dDeadline >= 0 && dDeadline <= 30) {
    if (dDeadline <= 7) score += 150;
    else if (dDeadline <= 14) score += 80;
    else score += 40;
  }

  // Fill rate — kosong = perlu push, full = ga perlu
  const quota = trip.quota || 0;
  const sold = trip.sold || 0;
  if (quota > 0) {
    const fillRate = sold / quota;
    if (fillRate >= 1) score -= 200;          // full = sangat low prio
    else if (fillRate >= 0.9) score -= 100;   // hampir full
    else if (fillRate >= 0.7) score += 0;     // on track
    else if (fillRate >= 0.5) score += 30;    // perlu sedikit push
    else if (fillRate >= 0.3) score += 80;    // perlu push
    else if (fillRate > 0) score += 120;      // sangat perlu push
    else score += 50;                          // 0% = belum mulai push
  }

  return score;
}

export function priorityLabel(score) {
  if (score >= 350) return { label: 'URGENT', color: 'bg-red-500 text-white animate-pulse' };
  if (score >= 250) return { label: 'High Push', color: 'bg-orange-500 text-white' };
  if (score >= 150) return { label: 'Push', color: 'bg-amber-100 text-amber-800' };
  if (score >= 80) return { label: 'Normal', color: 'bg-blue-100 text-blue-700' };
  if (score >= 0) return { label: 'On Track', color: 'bg-green-100 text-green-700' };
  if (score >= -100) return { label: 'Closed', color: 'bg-slate-100 text-slate-600' };
  return { label: 'Done/Cancelled', color: 'bg-slate-200 text-slate-500' };
}
