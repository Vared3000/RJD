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
    balances: [['Входящие', 'Куртка утеплённая', '52', '182', 2, 'Новая']],
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

test('стартовый импорт: цена аренды и нулевая ставка НДС читаются из номенклатуры', async () => {
  const buffer = await workbookBuffer({
    models: [['Куртка утеплённая', 'К-1', 'шт', 'clothing', 'Да', 1234.5, 0, 'Тест']],
  });
  const parsed = await parseStartupWorkbook(buffer);
  assert.equal(parsed.protocol.length, 0);
  assert.equal(parsed.payload.models[0].rentalPrice, 1234.5);
  assert.equal(parsed.payload.models[0].rentalVatRate, 0);
});

test('стартовый импорт: регион ДПО и категория по полу читаются из необязательных колонок', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('ДПО').addRows([
    [...STARTUP_IMPORT_HEADERS.dpos.headers, 'Регион'],
    ['ДПО-Р', 'Дирекция Р', 'DPO-R', '', '', '', '', 'Свердловская'],
  ]);
  workbook.addWorksheet('Номенклатура').addRows([
    [...STARTUP_IMPORT_HEADERS.models.headers, 'Категория по полу'],
    ['Куртка женская', 'К-2', 'шт', 'clothing', 'Нет', 500, 5, '', 'Женское'],
  ]);
  workbook.addWorksheet('Работники').addRow(STARTUP_IMPORT_HEADERS.employees.headers);
  workbook.addWorksheet('Остатки').addRow(STARTUP_IMPORT_HEADERS.balances.headers);

  const parsed = await parseStartupWorkbook(await workbook.xlsx.writeBuffer());
  assert.equal(parsed.protocol.length, 0);
  assert.equal(parsed.payload.dpos[0].region, 'Свердловская');
  assert.equal(parsed.payload.models[0].genderCategory, 'female');
});

test('стартовый импорт: старые файлы без колонок региона/категории по-прежнему импортируются', async () => {
  const buffer = await workbookBuffer({
    dpos: [['ДПО-Б', 'Дирекция Б', 'DPO-B']],
    models: [['Куртка', 'К-3', 'шт', 'clothing', 'Нет', 500, 5, '']],
  });
  const parsed = await parseStartupWorkbook(buffer);
  assert.equal(parsed.protocol.length, 0);
  assert.equal(parsed.payload.dpos[0].region, null);
  assert.equal(parsed.payload.models[0].genderCategory, 'unspecified');
});

test('стартовый импорт: нераспознанная категория по полу отклоняется с ошибкой', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('ДПО').addRow(STARTUP_IMPORT_HEADERS.dpos.headers);
  workbook.addWorksheet('Номенклатура').addRows([
    [...STARTUP_IMPORT_HEADERS.models.headers, 'Категория по полу'],
    ['Куртка', 'К-4', 'шт', 'clothing', 'Нет', 500, 5, '', 'Смешанное'],
  ]);
  workbook.addWorksheet('Работники').addRow(STARTUP_IMPORT_HEADERS.employees.headers);
  workbook.addWorksheet('Остатки').addRow(STARTUP_IMPORT_HEADERS.balances.headers);

  const parsed = await parseStartupWorkbook(await workbook.xlsx.writeBuffer());
  assert.ok(
    parsed.protocol.some(
      (item) => item.level === 'error' && item.message.includes('категория по полу'),
    ),
  );
});
