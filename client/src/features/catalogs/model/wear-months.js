export const WEAR_MONTHS = Object.freeze([
  { value: 1, label: 'Январь', shortLabel: 'Ян' },
  { value: 2, label: 'Февраль', shortLabel: 'Фев' },
  { value: 3, label: 'Март', shortLabel: 'Мар' },
  { value: 4, label: 'Апрель', shortLabel: 'Апр' },
  { value: 5, label: 'Май', shortLabel: 'Май' },
  { value: 6, label: 'Июнь', shortLabel: 'Июн' },
  { value: 7, label: 'Июль', shortLabel: 'Июл' },
  { value: 8, label: 'Август', shortLabel: 'Авг' },
  { value: 9, label: 'Сентябрь', shortLabel: 'Сен' },
  { value: 10, label: 'Октябрь', shortLabel: 'Окт' },
  { value: 11, label: 'Ноябрь', shortLabel: 'Ноя' },
  { value: 12, label: 'Декабрь', shortLabel: 'Дек' },
]);

export const ALL_WEAR_MONTHS = Object.freeze(WEAR_MONTHS.map(({ value }) => value));
export const SUMMER_WEAR_MONTHS = Object.freeze([4, 5, 6, 7, 8, 9, 10]);
export const WINTER_WEAR_MONTHS = Object.freeze([1, 2, 3, 11, 12]);

export function normalizeWearMonths(months) {
  return [...new Set(months ?? [])]
    .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12)
    .sort((left, right) => left - right);
}

function sameMonths(left, right) {
  const normalized = normalizeWearMonths(left);
  return (
    normalized.length === right.length && normalized.every((month, index) => month === right[index])
  );
}

function shortMonth(month) {
  return WEAR_MONTHS[month - 1]?.shortLabel ?? String(month);
}

export function formatWearMonths(months) {
  const normalized = normalizeWearMonths(months);
  if (normalized.length === 0) return 'Не настроено';
  if (sameMonths(normalized, ALL_WEAR_MONTHS)) return 'Круглый год';
  if (sameMonths(normalized, SUMMER_WEAR_MONTHS)) return 'Апр–Окт';
  if (sameMonths(normalized, WINTER_WEAR_MONTHS)) return 'Ноя–Мар';

  const ranges = [];
  let start = normalized[0];
  let previous = normalized[0];
  for (const month of normalized.slice(1)) {
    if (month === previous + 1) {
      previous = month;
      continue;
    }
    ranges.push([start, previous]);
    start = month;
    previous = month;
  }
  ranges.push([start, previous]);

  return ranges
    .map(([first, last]) =>
      first === last ? shortMonth(first) : `${shortMonth(first)}–${shortMonth(last)}`,
    )
    .join(', ');
}
