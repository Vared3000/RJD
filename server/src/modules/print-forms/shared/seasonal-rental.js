import { ALL_WEAR_MONTHS } from '../../../database/models/nomenclature-model.model.js';
import { floorMoney } from './money.js';

const DAY = 86400000;
const dateText = (value) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const timestamp = (value) => Date.parse(`${dateText(value)}T00:00:00Z`);
const text = (value) => new Date(value).toISOString().slice(0, 10);

// DATEONLY: включаем день выдачи и возврата, не зависим от локального TZ.
// Один элемент — разрешённая часть одного календарного месяца.
export function seasonalIntervals({
  from,
  to,
  issuedDate = from,
  returnedDate,
  wearMonthsSnapshot,
}) {
  const start = Math.max(timestamp(from), timestamp(issuedDate));
  const end = Math.min(timestamp(to), returnedDate ? timestamp(returnedDate) : Infinity);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return [];
  const months = new Set(wearMonthsSnapshot ?? ALL_WEAR_MONTHS);
  const intervals = [];
  let cursor = start;
  while (cursor <= end) {
    const date = new Date(cursor);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const nextMonth = Date.UTC(year, month + 1, 1);
    const last = Math.min(end, nextMonth - DAY);
    if (months.has(month + 1)) {
      intervals.push({
        from: text(cursor),
        to: text(last),
        month: text(cursor).slice(0, 7),
        days: (last - cursor) / DAY + 1,
        daysInMonth: new Date(nextMonth - DAY).getUTCDate(),
      });
    }
    cursor = nextMonth;
  }
  return intervals;
}

// Объединяем пересечения: две одинаковые вещи не удваивают расчётные дни.
export function mergeRentalIntervals(intervals) {
  const merged = [];
  for (const item of [...intervals].sort((a, b) => a.from.localeCompare(b.from))) {
    const previous = merged.at(-1);
    if (previous?.month === item.month && timestamp(item.from) <= timestamp(previous.to) + DAY) {
      if (item.to > previous.to) previous.to = item.to;
      previous.days = (timestamp(previous.to) - timestamp(previous.from)) / DAY + 1;
    } else merged.push({ ...item });
  }
  return merged;
}

export function rentalAmounts(intervals, monthlyPrice, vatRate) {
  const byMonth = new Map();
  for (const interval of intervals) {
    const month = byMonth.get(interval.month) ?? { days: 0, daysInMonth: interval.daysInMonth };
    month.days += interval.days;
    byMonth.set(interval.month, month);
  }
  // Сначала каждый месяц до копеек вниз, затем НДС на его стоимость.
  const breakdown = [...byMonth].map(([month, value]) => {
    const costWithoutVat = floorMoney((floorMoney(monthlyPrice) * value.days) / value.daysInMonth);
    const vatAmount = floorMoney((costWithoutVat * Number(vatRate)) / 100);
    return {
      month,
      ...value,
      costWithoutVat,
      vatAmount,
      totalWithVat: floorMoney(costWithoutVat + vatAmount),
    };
  });
  const sum = (key) => floorMoney(breakdown.reduce((total, item) => total + item[key], 0));
  return {
    coverageDays: sum('days'),
    costWithoutVat: sum('costWithoutVat'),
    vatAmount: sum('vatAmount'),
    totalWithVat: sum('totalWithVat'),
    breakdown,
  };
}

// Формулы расчётных форм 1.5 и ФПУ: полный месяц за каждый активный экземпляр.
// PDF читает сохранённые результаты этих формул.
export function rentalExcelFormulas(priceAddress, breakdown, vatRate) {
  const costs = breakdown.map(({ units }) => `${priceAddress}*${units}`);
  return {
    cost: costs.join('+') || '0',
    vat: costs.map((cost) => `(${cost})*${Number(vatRate)}/100`).join('+') || '0',
  };
}
