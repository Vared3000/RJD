import assert from 'node:assert/strict';
import test from 'node:test';
import { formatWearMonths, normalizeWearMonths } from './wear-months.js';

test('нормализует месяцы: удаляет дубли и сортирует', () => {
  assert.deepEqual(normalizeWearMonths([12, 2, 1, 2, 13, 0]), [1, 2, 12]);
});

test('показывает готовые периоды носки коротко и понятно', () => {
  assert.equal(formatWearMonths([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), 'Круглый год');
  assert.equal(formatWearMonths([4, 5, 6, 7, 8, 9, 10]), 'Апр–Окт');
  assert.equal(formatWearMonths([11, 12, 1, 2, 3]), 'Ноя–Мар');
  assert.equal(formatWearMonths([1, 2, 4]), 'Ян–Фев, Апр');
  assert.equal(formatWearMonths([]), 'Не настроено');
});
