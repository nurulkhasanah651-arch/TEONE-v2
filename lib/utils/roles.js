// Role-Based Access Control — constants + permission helpers
//
// Roles:
//   owner          — full access (set manually via Supabase)
//   manager        — full access (set manually via Supabase)
//   ops            — full access KECUALI /accounting
//   cs             — akses dashboard, trips, cs, visa, /finance/payments;
//                    TIDAK akses /finance/cashflow, /finance/pnr, /accounting,
//                    /tl-master, /tl
//   tour_leader    — HANYA /tl/*
//   pending        — belum set role (akses cuma /auth/role-picker)
// =====================================================================

export const ROLES = {
  OWNER: 'owner',
  MANAGER: 'manager',
  OPS: 'ops',
  CS: 'cs',
  TOUR_LEADER: 'tour_leader',
  PENDING: 'pending',
};

export const ROLE_LABELS = {
  owner: 'Owner',
  manager: 'Manager',
  ops: 'Ops / Finance',
  cs: 'CS',
  tour_leader: 'Tour Leader',
  pending: 'Belum Dipilih',
};

export const ROLE_BADGE_COLOR = {
  owner: 'bg-yellow-100 text-yellow-800',
  manager: 'bg-purple-100 text-purple-800',
  ops: 'bg-blue-100 text-blue-800',
  cs: 'bg-green-100 text-green-800',
  tour_leader: 'bg-pink-100 text-pink-800',
  pending: 'bg-slate-100 text-slate-700',
};

// Full path access map
// Format: each role lists path prefixes mereka boleh akses
const ACCESS_RULES = {
  owner:       ['*'],          // semua
  manager:     ['*'],          // semua
  ops: [
    '/dashboard',
    '/trips',
    '/cs',
    '/finance',                // semua finance OK
    '/visa',
    '/tl',
    '/tl-master',
  ],
  cs: [
    '/dashboard',
    '/trips',
    '/cs',
    '/finance/payments',       // CHUMA payment checklist
    '/visa',
  ],
  tour_leader: [
    '/tl',                     // HANYA portal TL
  ],
  pending: [
    '/auth',                   // cuma role picker
  ],
};

// Paths yang DI-BLACKLIST per role (explicit deny, dieksekusi setelah whitelist)
const ACCESS_BLACKLIST = {
  ops:         ['/accounting'],
  cs:          ['/accounting', '/finance/cashflow', '/finance/pnr', '/finance$', '/tl', '/tl-master'],
};

/**
 * Check apakah role boleh akses path tertentu
 */
export function canAccessPath(role, path) {
  if (!role || role === 'pending') {
    // Pending: cuma boleh /auth/*
    return path.startsWith('/auth');
  }

  const rules = ACCESS_RULES[role];
  if (!rules) return false;

  // Owner/manager always allow
  if (rules.includes('*')) return true;

  // Check whitelist
  const allowed = rules.some((prefix) => path === prefix || path.startsWith(prefix + '/') || path.startsWith(prefix));

  if (!allowed) return false;

  // Check blacklist (deny overrides allow)
  const blacklist = ACCESS_BLACKLIST[role] || [];
  for (const blocked of blacklist) {
    // Special: ends with '$' means exact match
    if (blocked.endsWith('$')) {
      if (path === blocked.slice(0, -1)) return false;
    } else if (path === blocked || path.startsWith(blocked + '/') || path.startsWith(blocked)) {
      return false;
    }
  }

  return true;
}

/**
 * Default landing page per role
 */
export function defaultPathForRole(role) {
  if (role === 'tour_leader') return '/tl';
  if (role === 'pending' || !role) return '/auth/role-picker';
  return '/dashboard';
}

/**
 * Filter nav items based on role
 * Input: array of nav items dengan { href, ... }
 */
export function filterNavByRole(navItems, role) {
  if (!role || role === 'pending') return [];
  return navItems.filter((item) => canAccessPath(role, item.href));
}

/**
 * Helper: extract role dari Supabase user object
 */
export function getRoleFromUser(user) {
  if (!user) return null;
  return user.user_metadata?.role || user.app_metadata?.role || null;
}
