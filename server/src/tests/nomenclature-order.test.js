import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_NOMENCLATURE_ORDER,
  compareNomenclatureRows,
  sortNomenclatureRows,
} from '../modules/print-forms/shared/nomenclature-order.js';

test('Р5: эталонный порядок сохраняет мужскую и женскую последовательности', () => {
  const names = [...CANONICAL_NOMENCLATURE_ORDER].reverse().map((modelName) => ({ modelName }));
  assert.deepEqual(
    names.sort(compareNomenclatureRows).map((row) => row.modelName),
    [...CANONICAL_NOMENCLATURE_ORDER],
  );
});

test('Р5: неизвестные модели идут после эталонных и стабильно по названию', () => {
  const rows = [
    { modelName: 'Якорь', modelId: '2' },
    { modelName: 'Бейдж именной', modelId: '3' },
    { modelName: 'Аксессуар', modelId: '1' },
  ];
  assert.deepEqual(
    rows.sort(compareNomenclatureRows).map((row) => row.modelName),
    ['Бейдж именной', 'Аксессуар', 'Якорь'],
  );
});

test('Р5: группировка сохраняется, а изделия внутри группы идут по эталону', () => {
  const rows = [
    { group: 'Б', modelName: 'Бейдж именной' },
    { group: 'А', modelName: 'Сумка форменная темно-синяя' },
    { group: 'А', modelName: 'Пальто форменное утепленное темно-синее' },
  ];
  assert.deepEqual(
    sortNomenclatureRows(rows, (row) => row.group).map((row) => `${row.group}:${row.modelName}`),
    [
      'А:Пальто форменное утепленное темно-синее',
      'А:Сумка форменная темно-синяя',
      'Б:Бейдж именной',
    ],
  );
});
