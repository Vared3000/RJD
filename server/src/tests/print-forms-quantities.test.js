import { test } from 'node:test';
import assert from 'node:assert/strict';
import { warehouseQuantity, accountingQuantity } from '../modules/print-forms/shared/quantities.js';

test('warehouseQuantity и accountingQuantity: cap 1 для закрывающих форм', () => {
  assert.equal(warehouseQuantity(2), 2);
  assert.equal(warehouseQuantity(2.9), 2);
  assert.equal(warehouseQuantity(-3), 0);
  assert.equal(warehouseQuantity(null), 0);
  assert.equal(warehouseQuantity(undefined), 0);

  assert.equal(accountingQuantity(0), 0);
  assert.equal(accountingQuantity(1), 1);
  assert.equal(accountingQuantity(2), 1);
  assert.equal(accountingQuantity(99), 1);
  assert.equal(accountingQuantity(-1), 0);
});
