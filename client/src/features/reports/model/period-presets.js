// Клиентское зеркало server/src/modules/reports/period.js — только для
// вычисления границ по кнопкам-пресетам (день/месяц/квартал/год), сам расчёт
// отчёта всегда идёт по from/to, которые сервер трактует авторитетно.
function pad(n) {
  return String(n).padStart(2, '0');
}

function toDateOnly(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function resolvePreset(preset, anchor = new Date()) {
  if (preset === 'day') {
    return { from: toDateOnly(anchor), to: toDateOnly(anchor) };
  }
  if (preset === 'month') {
    const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { from: toDateOnly(from), to: toDateOnly(to) };
  }
  if (preset === 'quarter') {
    const quarterStartMonth = Math.floor(anchor.getMonth() / 3) * 3;
    const from = new Date(anchor.getFullYear(), quarterStartMonth, 1);
    const to = new Date(anchor.getFullYear(), quarterStartMonth + 3, 0);
    return { from: toDateOnly(from), to: toDateOnly(to) };
  }
  // year
  const from = new Date(anchor.getFullYear(), 0, 1);
  const to = new Date(anchor.getFullYear(), 11, 31);
  return { from: toDateOnly(from), to: toDateOnly(to) };
}

export const PERIOD_PRESETS = [
  { value: 'day', label: 'День' },
  { value: 'month', label: 'Месяц' },
  { value: 'quarter', label: 'Квартал' },
  { value: 'year', label: 'Год' },
];
