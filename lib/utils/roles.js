// Role-Based Access Control — Round 40: add /chat & /tasks for all roles except TL
//
// Roles:
//   owner          — full access
//   manager        — full access
//   ops            — full KECUALI /accounting
//   cs             — terbatas + /chat + /tasks
//   tour_leader    — HANYA /tl/*
//   pending        — cuma /auth
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

const ACCESS_RULES = {
  owner:       ['*'],
  manager:     ['*'],
  ops: [
    '/dashboard',
    '/trips',
    '/cs',
    '/finance',
    '/visa',
    '/tl',
    '/tl-master',
    '/chat',
    '/tasks',
  ],
  cs: [
    '/dashboard',
    '/trips',
    '/cs',
    '/finance/payments',
    '/visa',
    '/chat',
    '/tasks',
  ],
  tour_leader: [
    '/tl',
    '/chat',     // TL juga bisa chat (kalau ga mau, hapus baris ini)
    '/tasks',    // TL juga bisa tasks (kalau ga mau, hapus baris ini)
  ],
  pending: [
    '/auth',
  ],
};

const ACCESS_BLACKLIST = {
  ops: ['/accounting'],
  cs:  ['/accounting', '/finance/cashflow', '/finance/pnr', '/finance$', '/tl', '/tl-master'],
};

export function canAccessPath(role, path) {
  if (!role || role === 'pending') {
    return path.startsWith('/auth');
  }

  const rules = ACCESS_RULES[role];
  if (!rules) return false;

  if (rules.includes('*')) return true;

  const allowed = rules.some((prefix) => path === prefix || path.startsWith(prefix + '/') || path.startsWith(prefix));
  if (!allowed) return false;

  const blacklist = ACCESS_BLACKLIST[role] || [];
  for (const blocked of blacklist) {
    if (blocked.endsWith('$')) {
      if (path === blocked.slice(0, -1)) return false;
    } else if (path === blocked || path.startsWith(blocked + '/') || path.startsWith(blocked)) {
      return false;
    }
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
