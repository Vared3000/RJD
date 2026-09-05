import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExportFileName,
  formatFilePeriod,
  sanitizeExportFileName,
  shortenEmployeeName,
} from '../utils/export-file-name.js';
import { attachmentHeader } from '../utils/attachment-header.js';

test('имя выгрузки собирается на русском без номеров документа и договора', () => {
  assert.equal(
    buildExportFileName({
      title: 'Сохранная расписка',
      objects: [shortenEmployeeName('Сташков Павел Андреевич')],
      date: '2026-08-08',
      extension: 'xlsx',
    }),
    'Сохранная_расписка_Сташков_П.А._08-08-2026.xlsx',
  );
});

test('полный календарный месяц получает русское название, версия сохраняется', () => {
  assert.deepEqual(formatFilePeriod('2026-08-01', '2026-08-31'), ['Август_2026']);
  assert.equal(
    buildExportFileName({
      title: 'Акт аренды',
      objects: ['ДПО Москва'],
      month: '2026-08',
      version: 2,
      extension: 'pdf',
    }),
    'Акт_аренды_ДПО_Москва_Август_2026_Версия_2.pdf',
  );
});

test('опасные символы Windows очищаются, пустые части пропускаются и длина ограничивается', () => {
  assert.equal(
    sanitizeExportFileName('Остатки: склад «Север/Юг»?.xlsx'),
    'Остатки_склад_Север_Юг.xlsx',
  );
  const longName = buildExportFileName({
    title: 'Список работников',
    objects: [`ДПО ${'Очень длинное название '.repeat(20)}`],
    date: '2026-09-03',
    extension: 'xlsx',
  });
  assert.ok(longName.replace(/\.xlsx$/, '').length <= 180);
  assert.match(longName, /^Список_работников_/);
  assert.match(longName, /_03-09-2026\.xlsx$/);
});

test('Content-Disposition содержит безопасный fallback и UTF-8 имя', () => {
  const header = attachmentHeader('Приложение_1.5_ДПО_Москва_Август_2026.xlsx');
  assert.match(header, /^attachment; filename="[\x20-\x7E]+"; filename\*=UTF-8''/);
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/)[1];
  assert.equal(decodeURIComponent(encoded), 'Приложение_1.5_ДПО_Москва_Август_2026.xlsx');
});
