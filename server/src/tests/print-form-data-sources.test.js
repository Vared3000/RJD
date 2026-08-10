import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSourceEntries } from '../modules/print-forms/shared/print-form-data-sources.js';

test('печатные формы: живые строки имеют приоритет, уникальные архивные сохраняются', () => {
  const base = {
    dpoKey: 'дпо-1',
    employeeKey: 'таб-1',
    modelKey: 'куртка',
    operationDate: '2026-07-15',
    quantity: 1,
  };
  const live = { ...base, source: 'live', sourceKey: 'line-1', documentKey: 'doc-1' };
  const duplicateArchive = {
    ...base,
    source: 'archive',
    sourceKey: 'import-1',
    documentKey: '',
  };
  const uniqueArchive = {
    ...base,
    source: 'archive',
    sourceKey: 'import-2',
    documentKey: '',
    modelKey: 'брюки',
  };

  assert.deepEqual(mergeSourceEntries([live], [duplicateArchive, uniqueArchive]), [
    live,
    uniqueArchive,
  ]);
});
