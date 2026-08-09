import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePositionName,
  parsePositionVariant,
} from '../modules/catalogs/positions/normalize-position-name.js';

test('название должности начинается с заглавной буквы', () => {
  assert.equal(
    normalizePositionName('дежурный помощник начальника вокзала'),
    'Дежурный помощник начальника вокзала',
  );
});

test('вариант комплекта отделяется от настоящего названия должности', () => {
  assert.deepEqual(parsePositionVariant('дежурный по выдаче справок мужской комплект'), {
    name: 'Дежурный по выдаче справок',
    gender: 'male',
  });
  assert.deepEqual(parsePositionVariant('Дежурный по выдаче справок женский комплект'), {
    name: 'Дежурный по выдаче справок',
    gender: 'female',
  });
});

test('обычная должность не получает ограничение по полу', () => {
  assert.deepEqual(parsePositionVariant('директор ДПО'), {
    name: 'Директор ДПО',
    gender: null,
  });
});

test('опечатка в дублирующей должности исправляется до канонического названия', () => {
  assert.equal(
    normalizePositionName('дежурный по по выдаче справок'),
    'Дежурный по выдаче справок',
  );
});
