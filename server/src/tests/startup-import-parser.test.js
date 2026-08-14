import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
  STARTUP_IMPORT_HEADERS,
  normalizeText,
  parseStartupWorkbook,
} from '../modules/startup-import/startup-import.parser.js';

async function workbookBuffer(rowsByKey = {}) {
  const workbook = new ExcelJS.Workbook();
  for (const [key, definition] of Object.entries(STARTUP_IMPORT_HEADERS)) {
    const sheet = workbook.addWorksheet(definition.sheet);
    sheet.addRow(definition.headers);
    for (const row of rowsByKey[key] ?? []) sheet.addRow(row);
  }
  return workbook.xlsx.writeBuffer();
}

test('стартовый импорт: нормализует пробелы, неразрывные пробелы и тире', () => {
  assert.equal(normalizeText('  Дежурный\u00a0  по—вокзалу  '), 'Дежурный по-вокзалу');
});

test('стартовый импорт: поставляемый шаблон распознаётся без замечаний', async () => {
  const template = fileURLToPath(
    new URL('../modules/startup-import/startup-import.template.xlsx', import.meta.url),
  );
  const parsed = await parseStartupWorkbook(await readFile(template));
  assert.deepEqual(parsed.payload, { dpos: [], models: [], employees: [], balances: [] });
  assert.equal(parsed.protocol.length, 0);
});

test('стартовый импорт: точный дубль пропускается, конфликт табельного номера блокирует применение', async () => {
  const buffer = await workbookBuffer({
    dpos: [
      ['ДПО-1', 'Дирекция пассажирских обустройств № 1', 'DPO-1'],
      ['ДПО-1', 'Дирекция пассажирских обустройств № 1', 'DPO-1'],
    ],
    models: [['Куртка утеплённая', 'К-1', 'шт', 'clothing', 'Да']],
    employees: [
      ['Иванов Иван Иванович', '001', 'ДПО-1', 'Дежурный', 'Мужской'],
      ['Петров Пётр Петрович', '001', 'ДПО-1', 'Дежурный', 'Мужской'],
    ],
    balances: [['Входящие', 'Куртка утеплённая', '52', '182', 2, 1000, 500, 'Новая']],
  });
  const parsed = await parseStartupWorkbook(buffer);
  assert.equal(parsed.payload.dpos.length, 1);
  assert.equal(parsed.duplicates.dpos, 1);
  assert.equal(parsed.payload.employees.length, 1);
  assert.ok(
    parsed.protocol.some(
      (item) => item.level === 'error' && item.message.includes('уже встречался'),
    ),
  );
});
