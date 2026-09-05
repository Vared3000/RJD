import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSizeOptionGroups } from './size-options.js';

const sizes = [
  { id: 'belt-54', type: 'belt', value: '54' },
  { id: 'clothing-42', type: 'clothing', value: '42' },
  { id: 'headwear-54', type: 'headwear', value: '54' },
  { id: 'clothing-38', type: 'clothing', value: '38' },
  { id: 'shoe-40', type: 'shoe', value: '40' },
  { id: 'height-182', type: 'height', value: '182' },
];

test('группирует размеры по назначению и сортирует значения внутри групп', () => {
  const groups = buildSizeOptionGroups(sizes);

  assert.deepEqual(
    groups.map((group) => [group.label, group.options.map((option) => option.label)]),
    [
      ['Одежда', ['38', '42']],
      ['Обувь', ['40']],
      ['Головной убор', ['54']],
      ['Ремень', ['54']],
    ],
  );
});

test('для выбранной модели оставляет только размеры её типа', () => {
  const groups = buildSizeOptionGroups(sizes, 'clothing');

  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, 'Одежда');
  assert.deepEqual(
    groups[0].options.map((option) => option.value),
    ['clothing-38', 'clothing-42'],
  );
});
