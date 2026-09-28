import test from 'node:test';
import assert from 'node:assert/strict';
import { rentalRows } from '../modules/print-forms/shared/rental-data.js';
import { roundedActTotal } from '../modules/print-forms/shared/precise-money.js';

function owned(modelId, employeeId, gender, price, instanceId = employeeId) {
  return {
    intervalStart: '2026-09-22',
    intervalEnd: '2026-09-30',
    issuedDate: '2026-09-22',
    returnedDate: null,
    wearMonthsSnapshot: [4, 5, 6, 7, 8, 9, 10],
    employeeId,
    employeeGender: gender,
    instanceId,
    positionId: 'position',
    positionName: 'Дежурный помощник начальника вокзала',
    modelId,
    modelName: modelId,
    unit: 'шт.',
    monthlyPriceWithoutVat: price,
    vatRate: 5,
  };
}

test('Приложение 1.5: восемь работниц дают восемь вещей и полную месячную сумму', () => {
  const rows = rentalRows(
    [
      {
        source: 'live',
        sourceReference: 'test',
        ownershipRows: Array.from({ length: 8 }, (_, index) =>
          owned('Блузка', `employee-${index}`, 'female', 975.6762),
        ),
      },
    ],
    { byPosition: true },
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].positionName, 'Дежурный помощник начальника вокзала женский комплект');
  assert.equal(rows[0].quantity, 8);
  assert.equal(rows[0].coverageDays, 30);
  assert.equal(rows[0].costWithoutVat, 7805.4096);
  assert.equal(roundedActTotal(rows, 'totalWithVat'), 8195.68);
});

test('Р4: два физических экземпляра одной модели у работника дают одну расчётную единицу', () => {
  const rows = rentalRows([
    {
      source: 'live',
      sourceReference: 'test',
      ownershipRows: [
        owned('Плащ', 'employee-1', 'female', 1000, 'instance-1'),
        owned('Плащ', 'employee-1', 'female', 1000, 'instance-2'),
      ],
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 1);
  assert.equal(rows[0].costWithoutVat, 1000);
  assert.equal(rows[0].vatAmount, 50);
  assert.equal(rows[0].totalWithVat, 1050);
});

test('Приложение 1.5: общая модель разделяется по мужскому и женскому комплектам', () => {
  const rows = rentalRows(
    [
      {
        source: 'live',
        sourceReference: 'test',
        ownershipRows: [
          owned('Ремень', 'male-employee', 'male', 94.1245),
          owned('Ремень', 'female-employee', 'female', 94.1245),
        ],
      },
    ],
    { byPosition: true },
  );
  assert.deepEqual(
    rows.map((row) => row.quantity),
    [1, 1],
  );
  assert.match(rows[0].positionName, /мужской комплект$/);
  assert.match(rows[1].positionName, /женский комплект$/);
});
