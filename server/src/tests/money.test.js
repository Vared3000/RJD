import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floorMoney, money, calculateMoney } from '../modules/print-forms/shared/money.js';

test('floorMoney округляет до копеек в меньшую сторону', () => {
  assert.equal(floorMoney(100), 100);
  assert.equal(floorMoney(1.005), 1);
  assert.equal(floorMoney(33.339), 33.33);
  assert.equal(floorMoney(566.1975), 566.19);
  assert.equal(floorMoney(11890.1475), 11890.14);
  assert.equal(floorMoney(null), 0);
  assert.equal(floorMoney('bad'), 0);
});

test('money совпадает с floorMoney', () => {
  assert.equal(money(105.999), 105.99);
});

test('calculateMoney: 100 ₽ + 5% НДС = 105,00 ₽', () => {
  const result = calculateMoney(1, 100, 5);
  assert.deepEqual(result, {
    costWithoutVat: 100,
    vatAmount: 5,
    totalWithVat: 105,
    priceWithVat: 105,
  });
});

test('calculateMoney: 33,33 ₽ + 5% НДС с floor на каждом шаге', () => {
  const result = calculateMoney(1, 33.33, 5);
  assert.equal(result.costWithoutVat, 33.33);
  assert.equal(result.vatAmount, 1.66);
  assert.equal(result.totalWithVat, 34.99);
  assert.equal(result.priceWithVat, 34.99);
});

test('calculateMoney: количество умножается до округления НДС', () => {
  const result = calculateMoney(2, 100, 5);
  assert.equal(result.costWithoutVat, 200);
  assert.equal(result.vatAmount, 10);
  assert.equal(result.totalWithVat, 210);
});

test('calculateMoney: явная цена с НДС', () => {
  const result = calculateMoney(1, 100, 5, 105);
  assert.deepEqual(result, {
    costWithoutVat: 100,
    vatAmount: 5,
    totalWithVat: 105,
    priceWithVat: 105,
  });
});
