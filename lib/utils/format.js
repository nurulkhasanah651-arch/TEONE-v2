// Currency, date, and string formatters

export function fmtRupiah(n) {
  if (!n || isNaN(n)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

export function fmtShort(n) {
  if (!n || isNaN(n)) return '—';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'M';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'jt';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'rb';
  return n.toString();
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export function daysUntil(iso) {
  if (!iso) return 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(iso); target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat Pagi';
  if (h < 15) return 'Selamat Siang';
  if (h < 18) return 'Selamat Sore';
  return 'Selamat Malam';
}

// Compute age in years from a date-of-birth string (YYYY-MM-DD)
export function calcAge(birthday) {
  if (!birthday) return null;
  const dob = new Date(birthday);
  if (isNaN(dob)) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

// Passport validity status — returns { status, label, color }
// status: 'valid' (>6mo), 'expiring' (<=6mo), 'expired'
export function passportStatus(expiry) {
  if (!expiry) return null;
  const exp = new Date(expiry);
  if (isNaN(exp)) return null;
  const today = new Date();
  const diffMs = exp - today;
  const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30);
  if (diffMs < 0) return { status: 'expired', label: 'EXPIRED', color: 'red' };
  if (diffMonths <= 6) return { status: 'expiring', label: 'Akan Expired', color: 'amber' };
  return { status: 'valid', label: 'Valid', color: 'green' };
}
