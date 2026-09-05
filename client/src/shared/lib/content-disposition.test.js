import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileNameFromContentDisposition } from './content-disposition.js';

test('filename* имеет приоритет и декодирует русское имя', () => {
  const header =
    'attachment; filename="_________1.5.xlsx"; ' +
    "filename*=UTF-8''%D0%9F%D1%80%D0%B8%D0%BB%D0%BE%D0%B6%D0%B5%D0%BD%D0%B8%D0%B5_1.5.xlsx";
  assert.equal(fileNameFromContentDisposition(header), 'Приложение_1.5.xlsx');
});

test('обычный filename используется как резерв', () => {
  assert.equal(fileNameFromContentDisposition('attachment; filename="report.xlsx"'), 'report.xlsx');
  assert.equal(fileNameFromContentDisposition(''), null);
});
