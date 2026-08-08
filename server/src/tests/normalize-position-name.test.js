import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePositionName } from '../modules/catalogs/positions/normalize-position-name.js';

test('название должности начинается с заглавной буквы', () => {
  assert.equal(
    normalizePositionName('дежурный помощник начальника вокзала'),
    'Дежурный помощник начальника вокзала',
  );
});

test('опечатка в дублирующей должности исправляется до канонического названия', () => {
  assert.equal(
    normalizePositionName('дежурный по по выдаче справок'),
    'Дежурный по выдаче справок',
  );
});
