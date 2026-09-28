import test from 'node:test';
import assert from 'node:assert/strict';
import {
  seasonalIntervals,
  mergeRentalIntervals,
  rentalAmounts,
} from '../modules/print-forms/shared/seasonal-rental.js';

const winter = [1, 2, 3, 11, 12];
const summer = [4, 5, 6, 7, 8, 9, 10];
const intervals = (overrides = {}) =>
  seasonalIntervals({
    from: '2026-01-01',
    to: '2026-01-31',
    issuedDate: '2026-01-10',
    wearMonthsSnapshot: winter,
    ...overrides,
  });

test('сезонность: оба комплекта выданы зимой, летний начинает расчёт летом', () => {
  assert.equal(intervals()[0].days, 22);
  assert.deepEqual(intervals({ wearMonthsSnapshot: summer }), []);
  assert.equal(
    intervals({ from: '2026-07-01', to: '2026-07-31', wearMonthsSnapshot: summer })[0].days,
    31,
  );
  assert.deepEqual(intervals({ from: '2026-07-01', to: '2026-07-31' }), []);
});

test('сезонность: включены обе границы, нет дней вне владения', () => {
  assert.equal(intervals({ returnedDate: '2026-01-10' })[0].days, 1);
  assert.equal(intervals({ returnedDate: '2026-01-20' })[0].days, 11);
  assert.deepEqual(intervals({ returnedDate: '2025-12-31' }), []);
  assert.deepEqual(intervals({ issuedDate: '2026-02-01' }), []);
});

test('сезонность: високосный февраль, переход года, разрывные месяцы', () => {
  const result = intervals({
    from: '2023-12-15',
    to: '2024-03-10',
    issuedDate: '2020-01-01',
    wearMonthsSnapshot: [12, 2],
  });
  assert.deepEqual(
    result.map((row) => [row.month, row.days, row.daysInMonth]),
    [
      ['2023-12', 17, 31],
      ['2024-02', 29, 29],
    ],
  );
  assert.equal(rentalAmounts(result, 3100, 5).costWithoutVat, 4800);
  assert.equal(rentalAmounts(result, 3100, 5).totalWithVat, 5040);
});

test('сезонность: пересечения и повторные выдачи не дублируют дни расчётной позиции', () => {
  const merged = mergeRentalIntervals([
    ...intervals(),
    ...intervals(),
    ...intervals({ issuedDate: '2026-01-20' }),
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].days, 22);
  const money = rentalAmounts(merged, 1000, 5);
  assert.equal(money.costWithoutVat, 709.67);
  assert.equal(money.vatAmount, 35.48);
  assert.equal(money.totalWithVat, 745.15);
});

test('сезонность: старые снимки считаются круглый год, пустой набор не даёт дней', () => {
  assert.equal(intervals({ wearMonthsSnapshot: null })[0].days, 22);
  assert.deepEqual(intervals({ wearMonthsSnapshot: [] }), []);
  const gap = mergeRentalIntervals([
    ...intervals({ issuedDate: '2026-01-01', returnedDate: '2026-01-05' }),
    ...intervals({ issuedDate: '2026-01-10', returnedDate: '2026-01-15' }),
  ]);
  assert.equal(rentalAmounts(gap, 3100, 5).coverageDays, 11);
});
