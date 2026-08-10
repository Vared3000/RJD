import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMonthlyRentalRows,
  resolveMonth,
} from '../modules/print-forms/monthly-rental-act/monthly-rental-act.service.js';

function row(overrides = {}) {
  return {
    employeeName: 'Иванов Иван Иванович',
    personnelNumber: '001',
    modelName: 'Куртка',
    inventoryNumber: 'INV-1',
    intervalStart: '2026-07-01',
    intervalEnd: '2026-07-31',
    issuedDate: '2026-06-15',
    returnedDate: null,
    monthlyPriceWithoutVat: 3100,
    vatRate: 5,
    warnings: [],
    ...overrides,
  };
}

test('resolveMonth возвращает границы полного календарного месяца', () => {
  assert.deepEqual(resolveMonth('2024-02'), {
    month: '2024-02',
    monthStart: '2024-02-01',
    monthEnd: '2024-02-29',
    daysInMonth: 29,
  });
  assert.throws(() => resolveMonth('2024-13'), /календарный месяц/);
});

test('месячная аренда считает полный и неполный интервалы одной формулой', () => {
  const rows = calculateMonthlyRentalRows(
    [
      row(),
      row({
        inventoryNumber: 'INV-2',
        issuedDate: '2026-07-16',
        intervalStart: '2026-07-16',
      }),
      row({
        inventoryNumber: 'INV-3',
        returnedDate: '2026-07-10',
        intervalEnd: '2026-07-10',
      }),
      row({
        inventoryNumber: 'INV-4',
        issuedDate: '2026-07-10',
        returnedDate: '2026-07-20',
        intervalStart: '2026-07-10',
        intervalEnd: '2026-07-20',
      }),
    ],
    31,
  );

  assert.deepEqual(
    rows.map((item) => item.rentalDays),
    [31, 16, 10, 11],
  );
  assert.equal(rows[0].costWithoutVat, 3100);
  assert.equal(rows[1].costWithoutVat, 1600);
  assert.equal(rows[2].costWithoutVat, 1000);
  assert.equal(rows[3].costWithoutVat, 1100);
  assert.equal(rows[3].vatAmount, 55);
  assert.equal(rows[3].totalWithVat, 1155);
});

test('строка без цены и инвентарного номера получает предупреждения', () => {
  const [result] = calculateMonthlyRentalRows(
    [row({ inventoryNumber: '', monthlyPriceWithoutVat: null })],
    31,
  );
  assert.equal(result.totalWithVat, 0);
  assert.ok(result.warnings.some((warning) => warning.includes('инвентарный номер')));
  assert.ok(result.warnings.some((warning) => warning.includes('цена аренды')));
});
