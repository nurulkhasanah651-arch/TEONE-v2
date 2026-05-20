// Payment milestone types

export const PAYMENT_TYPES = [
  { value: 'DP',        label: 'DP',         order: 1, color: 'amber' },
  { value: 'P1',        label: 'Payment 1',  order: 2, color: 'blue' },
  { value: 'P2',        label: 'Payment 2',  order: 3, color: 'blue' },
  { value: 'P3',        label: 'Payment 3',  order: 4, color: 'blue' },
  { value: 'Pelunasan', label: 'Pelunasan',  order: 5, color: 'green' },
  { value: 'Visa',      label: 'Visa',       order: 6, color: 'purple' },
  { value: 'Asuransi',  label: 'Asuransi',   order: 7, color: 'indigo' },
  { value: 'Custom',    label: 'Custom',     order: 99, color: 'slate' },
];

export const TYPE_BY_VALUE = Object.fromEntries(PAYMENT_TYPES.map((t) => [t.value, t]));

export function paymentTypeOptions() {
  return PAYMENT_TYPES.map((t) => ({ value: t.value, label: t.label }));
}

export function typeColor(value) {
  return TYPE_BY_VALUE[value]?.color || 'slate';
}

export function typeColorClasses(value) {
  const c = typeColor(value);
  const map = {
    amber:  { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
    blue:   { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
    green:  { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
    slate:  { bg: 'bg-slate-100', text: 'text-slate-700',  border: 'border-slate-200' },
  };
  return map[c] || map.slate;
}
