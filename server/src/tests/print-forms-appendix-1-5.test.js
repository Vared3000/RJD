// Требует применённых миграций и сида (pnpm db:migrate && pnpm db:seed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { env } from '../config/env.js';
import {
  binaryParser,
  setupApp,
  setupBaseFixture,
  createArchiveRecord,
  destroyLiveIssuanceState,
  cleanupFixtureState,
} from './print-forms-fixture.js';

test('печатная форма Приложение 1.5: живые строки по должностям и архивный порядок', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const { agent, auth } = await setupApp();
  const unique = `Test Appendix15 ${Date.now()}`;
  const { state } = await setupBaseFixture({ agent, auth, unique });
  t.after(() => cleanupFixtureState(state));

  const query = { dpoId: state.dpoId, from: '2026-07-01', to: '2026-07-31' };

  const xlsx = await auth(agent.get('/api/v1/print-forms/appendix-1-5'))
    .query({ ...query, format: 'xlsx' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(xlsx.status, 200);
  assert.match(xlsx.headers['content-type'], /spreadsheetml/);
  assert.equal(xlsx.body.subarray(0, 2).toString(), 'PK');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsx.body);
  const sheet = workbook.worksheets[0];
  assert.equal(
    sheet.getCell('E7').value,
    2,
    'две одинаковые выданные вещи должны давать количество 2',
  );
  assert.match(workbook.subject, /Сформировано/);
  const cellValues = [];
  let hasFormula = false;
  sheet.eachRow((row) =>
    row.eachCell((cell) => {
      cellValues.push(String(cell.value ?? ''));
      if (cell.value && typeof cell.value === 'object' && cell.value.formula) hasFormula = true;
    }),
  );
  assert.ok(cellValues.some((value) => value.trim()));
  assert.ok(cellValues.some((value) => value.includes(unique)));
  assert.ok(cellValues.some((value) => value.toUpperCase().includes('ИТОГО')));
  assert.ok(hasFormula, 'в расчётных ячейках должны быть формулы');

  const pdf = await auth(agent.get('/api/v1/print-forms/appendix-1-5'))
    .query({ ...query, format: 'pdf' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers['content-type'], /application\/pdf/);
  assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdf.body.length > 5000);

  // Архивные строки без сотрудника (formType='appendix-1-5' по умолчанию,
  // должность заполнена) должны сохранять исходный порядок строк Excel и
  // собственные суммы из архива, а не пересчитанные. Живые строки убираются,
  // иначе они займут первую строку данных перед архивными.
  await destroyLiveIssuanceState(state);
  await createArchiveRecord({
    state,
    sourceKeyPrefix: 'print-form-archive-1-5-late',
    sourceFile: 'archive-order-1-5.xlsx',
    sheetName: 'Приложение 1.5',
    rowNumber: 20,
    payload: {
      type: 'nomenclature',
      dpo: unique,
      effectiveDate: '2026-07-31',
      rowNumber: 20,
      name: `${unique} архив 1.5 поздняя строка`,
      unit: 'шт.',
      position: 'Архивная должность',
      employee: null,
      quantity: 2,
      coverageDays: 62,
      priceWithoutVat: 800,
      subtotalWithoutVat: 800,
      totalWithoutVat: 840,
      vatAmount: 80,
      totalWithVat: 1680,
      sourceFormulas: {},
    },
  });
  await createArchiveRecord({
    state,
    sourceKeyPrefix: 'print-form-archive-1-5-early',
    sourceFile: 'archive-order-1-5.xlsx',
    sheetName: 'Приложение 1.5',
    rowNumber: 10,
    payload: {
      type: 'nomenclature',
      dpo: unique,
      effectiveDate: '2026-07-31',
      rowNumber: 10,
      name: `${unique} архив 1.5 ранняя строка`,
      unit: 'шт.',
      position: 'Архивная должность',
      employee: null,
      quantity: 0,
      coverageDays: 0,
      priceWithoutVat: 123.45678,
      subtotalWithoutVat: 0,
      totalWithoutVat: 6.172839,
      vatAmount: 0,
      totalWithVat: 0,
      sourceFormulas: {},
    },
  });

  const archiveXlsx = await auth(agent.get('/api/v1/print-forms/appendix-1-5'))
    .query({ ...query, format: 'xlsx' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(archiveXlsx.status, 200);
  const archiveWorkbook = new ExcelJS.Workbook();
  await archiveWorkbook.xlsx.load(archiveXlsx.body);
  const archiveSheet = archiveWorkbook.worksheets[0];
  const archiveValues = [];
  archiveSheet.eachRow((row) =>
    row.eachCell((cell) => archiveValues.push(String(cell.value ?? ''))),
  );
  assert.ok(archiveValues.some((value) => value.includes('Архивная должность')));
  assert.equal(archiveSheet.getColumn(7).hidden, false, 'исходная цена должна быть видимой');
  assert.match(
    String(archiveSheet.getCell('C7').value ?? ''),
    /ранняя строка/,
    'строки архивного приложения 1.5 должны сохранять исходный порядок Excel',
  );
  assert.match(String(archiveSheet.getCell('C8').value ?? ''), /поздняя строка/);
  assert.equal(archiveSheet.getCell('G7').value, 123.45678);
  assert.equal(archiveSheet.getCell('H7').value, 0);
  assert.equal(archiveSheet.getCell('I7').value, 6.172839);
  assert.equal(archiveSheet.getCell('J8').value, 80);
  assert.equal(archiveSheet.getCell('K8').value, 1680);
});
