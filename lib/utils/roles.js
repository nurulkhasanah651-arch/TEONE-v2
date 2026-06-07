// RBAC roles — Round 66: FIX critical path matching bug
// Bug: /tl-master matching /tl prefix → TL bisa akses Master TL (LEAK!)
// Fix: strict path boundary check

export const ROLES = {
  OWNER: 'owner', MANAGER: 'manager', OPS: 'ops', CS: 'cs',
  TOUR_LEADER: 'tour_leader', PIC: 'pic', PENDING: 'pending',
};

export const ROLE_LABELS = {
  owner: 'Owner', manager: 'Manager', ops: 'Ops / Finance', cs: 'CS',
  tour_leader: 'Tour Leader', pic: 'PIC Trip', pending: 'Belum Dipilih',
};

export const ROLE_BADGE_COLOR = {
  owner: 'bg-yellow-100 text-yellow-800',
  manager: 'bg-purple-100 text-purple-800',
  ops: 'bg-blue-100 text-blue-800',
  cs: 'bg-green-100 text-green-800',
  tour_leader: 'bg-pink-100 text-pink-800',
  pic: 'bg-orange-100 text-orange-800',
  pending: 'bg-slate-100 text-slate-700',
};

const ACCESS_RULES = {
  owner:       ['*'],
  manager:     ['*'],
  ops: [
    '/dashboard', '/trips', '/cs', '/finance', '/visa', '/tl', '/tl-master',
    '/chat', '/tasks', '/ads', '/download',
  ],
  cs: [
    '/dashboard', '/trips', '/cs', '/finance/payments', '/visa',
    '/chat', '/tasks', '/download',
  ],
  tour_leader: ['/tl', '/chat', '/tasks'],
  // PIC: semua menu KECUALI accounting & HR — pembatasan per-trip dijaga database
  pic: [
    '/dashboard', '/trips', '/cs', '/quotations', '/ads', '/finance', '/invoices',
    '/refunds', '/visa', '/passport-manage', '/tl', '/tl-master', '/tasks', '/chat', '/download',
  ],
  pending: ['/auth'],
};

const ACCESS_BLACKLIST = {
  ops: ['/accounting'],
  pic: ['/accounting', '/hr'],
  cs:  ['/accounting', '/finance/cashflow', '/finance/pnr', '/finance', '/tl', '/tl-master', '/ads'],
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

  const rules = ACCESS_RULES[role];
  if (!rules) return false;

  // Wildcard check
  if (rules.includes('*')) return true;

  // Whitelist check — STRICT boundary
  const allowed = rules.some((prefix) => pathMatchesPrefix(path, prefix));
  if (!allowed) return false;

  // Blacklist check (deny overrides allow) — STRICT boundary
  const blacklist = ACCESS_BLACKLIST[role] || [];
  for (const blocked of blacklist) {
    if (pathMatchesPrefix(path, blocked)) return false;
  }

  return true;
}

export function defaultPathForRole(role) {
  if (role === 'tour_leader') return '/tl';
  if (role === 'pending' || !role) return '/auth/role-picker';
  return '/dashboard';
}

export function filterNavByRole(navItems, role) {
  if (!role || role === 'pending') return [];
  return navItems.filter((item) => canAccessPath(role, item.href));
}

export function getRoleFromUser(user) {
  if (!user) return null;
  return user.user_metadata?.role || user.app_metadata?.role || null;
}
