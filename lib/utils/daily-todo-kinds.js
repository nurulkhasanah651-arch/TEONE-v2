// Jenis pengerjaan to-do harian. Dipakai server (validasi) & client (pilihan/label).
// Path: lib/utils/daily-todo-kinds.js

export const TODO_KINDS = [
  { key: 'delegasi', label: 'Delegasi', short: 'Delegasi', cls: 'bg-blue-50 border-blue-300 text-blue-700' },
  { key: 'teknis', label: 'Teknis (kerjakan sendiri)', short: 'Teknis', cls: 'bg-emerald-50 border-emerald-300 text-emerald-700' },
  { key: 'strategist', label: 'Strategist (keputusan)', short: 'Strategist', cls: 'bg-purple-50 border-purple-300 text-purple-700' },
];

export const TODO_KIND_KEYS = TODO_KINDS.map((k) => k.key);
export const todoKind = (key) => TODO_KINDS.find((k) => k.key === key) || null;
