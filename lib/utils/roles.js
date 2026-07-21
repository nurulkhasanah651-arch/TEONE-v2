// RBAC roles — Round 67: role accounting (akses penuh), manager/ops/pic/cs
// pakai wildcard + blacklist. PENTING: blacklist dievaluasi SEBELUM wildcard.

export const ROLES = {
  OWNER: 'owner', ACCOUNTING: 'accounting', MANAGER: 'manager', OPS: 'ops', CS: 'cs',
  TOUR_LEADER: 'tour_leader', PIC: 'pic', PENDING: 'pending',
};

export const ROLE_LABELS = {
  owner: 'Owner', accounting: 'Accounting', manager: 'Manager', ops: 'Ops', cs: 'CS',
  tour_leader: 'Tour Leader', pic: 'PIC Trip', mitra: 'Mitra', pending: 'Belum Dipilih',
};

export const ROLE_BADGE_COLOR = {
  owner: 'bg-yellow-100 text-yellow-800',
  accounting: 'bg-teal-100 text-teal-800',
  manager: 'bg-purple-100 text-purple-800',
  ops: 'bg-blue-100 text-blue-800',
  cs: 'bg-green-100 text-green-800',
  tour_leader: 'bg-pink-100 text-pink-800',
  pic: 'bg-orange-100 text-orange-800',
  mitra: 'bg-teal-100 text-teal-800',
  pending: 'bg-slate-100 text-slate-700',
};

const ACCESS_RULES = {
  owner:       ['*'],
  accounting:  ['*'],
  manager:     ['*'],
  ops:         ['*'],
  pic:         ['*'],   // pembatasan per-trip dijaga database (RLS)
  cs:          ['*'],
  tour_leader: ['/tl', '/chat', '/tasks'],
  mitra: ['/mitra'],
  pending:     ['/auth'],
};

const ACCESS_BLACKLIST = {
  manager: ['/accounting', '/hr'],
  ops:     ['/accounting', '/hr'],
  pic:     ['/accounting', '/hr'],  // PIC akses semua kecuali accounting, hr, (dan /ceo owner-only)
  cs:      ['/accounting', '/hr', '/finance', '/invoices', '/operasional'],  // CS: akses semua kecuali ops, finance, hr, accounting, invoices
};

/**
 * STRICT path matching:
 * - Exact match: path === prefix
 * - Subpath match: path starts with prefix + '/'
 * - Wildcard '*' = match all
 * - Does NOT match adjacent paths (e.g. /tl does NOT match /tl-master)
 */
function pathMatchesPrefix(path, prefix) {
  if (prefix === '*') return true;
  if (path === prefix) return true;
  if (path.startsWith(prefix + '/')) return true;
  return false;
}

export function canAccessPath(role, path) {
  if (!role || role === 'pending') {
    return pathMatchesPrefix(path, '/auth');
  }

  // Absensi self check-in boleh diakses semua karyawan (kecuali tour leader yg portal-only)
  if (pathMatchesPrefix(path, '/hr/attendance') && role !== 'tour_leader') {
    return true;
  }
  // Pesan WA tertunda (banner Fonnte logout) — semua staf boleh lihat & kirim ulang
  if (pathMatchesPrefix(path, '/wa-pending') && role !== 'tour_leader') {
    return true;
  }

  // R232: PNR Inventory + E-Ticket — semua staf internal boleh akses (termasuk CS),
  // walau /finance di-blacklist utk CS. Tour Leader & Mitra tetap tidak.
  if (pathMatchesPrefix(path, '/finance/pnr')) {
    return role !== 'tour_leader' && role !== 'mitra';
  }

  // Tour Confirmation — semua staf internal boleh akses (termasuk CS), walau /operasional
  // di-blacklist utk CS. Tour Leader & Mitra tetap tidak.
  if (pathMatchesPrefix(path, '/operasional/tour-confirmation')) {
    return role !== 'tour_leader' && role !== 'mitra';
  }

  // CEO dashboard: OWNER-only (defense-in-depth; role lain punya '*')
  if (pathMatchesPrefix(path, '/ceo')) return role === 'owner';

  const rules = ACCESS_RULES[role];
  if (!rules) return false;

  // Blacklist DULU — deny overrides allow (termasuk wildcard)
  const blacklist = ACCESS_BLACKLIST[role] || [];
  for (const blocked of blacklist) {
    if (pathMatchesPrefix(path, blocked)) return false;
  }

  if (rules.includes('*')) return true;
  return rules.some((prefix) => pathMatchesPrefix(path, prefix));
}

export function defaultPathForRole(role) {
  if (role === 'tour_leader') return '/tl';
  if (role === 'mitra') return '/mitra';
  if (role === 'pending' || !role) return '/auth/role-picker';
  return '/dashboard';
}

export function filterNavByRole(navItems, role) {
  if (!role || role === 'pending') return [];
  return navItems.filter((item) => canAccessPath(role, item.href));
}

export function getRoleFromUser(user) {
  if (!user) return null;
  return user.app_metadata?.role || user.user_metadata?.role || user.app_metadata?.role || null;
}
