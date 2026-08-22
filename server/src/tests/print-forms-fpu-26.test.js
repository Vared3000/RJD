// Требует применённых миграций и сида (pnpm db:migrate && pnpm db:seed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { env } from '../config/env.js';
import {
  binaryParser,
  setupApp,
  setupBaseFixture,
  createPartyVersion,
  createArchiveRecord,
  destroyLiveIssuanceState,
  cleanupFixtureState,
} from './print-forms-fixture.js';

test('печатная форма ФПУ-26: живые строки, смена реквизитов исполнителя, архивные строки', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const { agent, auth } = await setupApp();
  const unique = `Test FPU26 ${Date.now()}`;
  const { state, dpo } = await setupBaseFixture({ agent, auth, unique });
  t.after(() => cleanupFixtureState(state));

  const query = { dpoId: state.dpoId, from: '2026-07-01', to: '2026-07-31' };

  const xlsx = await auth(agent.get('/api/v1/print-forms/fpu-26'))
    .query({ ...query, format: 'xlsx' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(xlsx.status, 200);
  assert.match(xlsx.headers['content-type'], /spreadsheetml/);
  assert.equal(xlsx.body.subarray(0, 2).toString(), 'PK');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsx.body);
  const sheet = workbook.worksheets[0];
  assert.ok(sheet);
  let liveRow = null;
  sheet.eachRow((row) => {
    if (row.values.some((value) => String(value ?? '') === unique)) liveRow = row.number;
  });
  assert.ok(liveRow, 'строка выданной модели должна присутствовать в ФПУ-26');
  assert.equal(
    sheet.getCell(`F${liveRow}`).value,
    1,
    'ФПУ-26: учётное кол-во = 1 при выдаче 2 шт.',
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
  assert.ok(
    cellValues.some((value) => value.trim()),
    'форма не должна быть пустой',
  );
  assert.ok(cellValues.some((value) => value.includes(unique)));
  assert.ok(cellValues.some((value) => value.toUpperCase().includes('ИТОГО')));
  assert.ok(hasFormula, 'в расчётных ячейках должны быть формулы');

  const pdf = await auth(agent.get('/api/v1/print-forms/fpu-26'))
    .query({ ...query, format: 'pdf' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers['content-type'], /application\/pdf/);
  assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdf.body.length > 5000);

  // Реквизиты исполнителя должны браться на дату окончания периода: до новой
  // версии — старая ООО «Лазурит», после — новая тестовая версия.
  await createPartyVersion({ agent, auth, state, effectiveDate: '2026-07-20' });

  async function fpuPartyNames(to) {
    const response = await auth(agent.get('/api/v1/print-forms/fpu-26'))
      .query({ dpoId: state.dpoId, from: '2026-07-01', to, format: 'xlsx' })
      .buffer(true)
      .parse(binaryParser);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(response.body);
    const values = [];
    wb.worksheets[0].eachRow((row) =>
      row.eachCell((cell) => values.push(String(cell.value ?? ''))),
    );
    return values.join('\n');
  }
  assert.match(await fpuPartyNames('2026-07-15'), /Лазурит/);
  assert.match(await fpuPartyNames('2026-07-31'), /Тестовый исполнитель/);

  // Архивные строки ФПУ-26 (formType='fpu-26') должны сохранять исходный
  // порядок Excel (по номеру строки), а не пересортировываться алфавитно.
  // Живые строки убираются, иначе они займут первую строку данных перед
  // архивными и сдвинут ожидаемые номера ячеек.
  await destroyLiveIssuanceState(state);
  await createArchiveRecord({
    state,
    sourceKeyPrefix: 'print-form-archive-fpu26-late',
    sourceFile: 'archive-order-fpu-26.xlsx',
    sheetName: 'Акт выполненных работ',
    rowNumber: 43,
    payload: {
      type: 'nomenclature',
      dpo: unique,
      effectiveDate: '2026-07-31',
      formType: 'fpu-26',
      rowNumber: 43,
      name: `${unique} архив ФПУ поздняя строка`,
      unit: 'шт.',
      position: null,
      employee: null,
      quantity: 5,
      priceWithoutVat: 2264.79,
      displayedPriceWithoutVat: 2264.79,
      subtotalWithoutVat: 11323.95,
      vatAmount: 566.1975,
      totalWithVat: 11890.1475,
      sourceFormulas: {},
    },
  });
  await createArchiveRecord({
    state,
    sourceKeyPrefix: 'print-form-archive-fpu26-early',
    sourceFile: 'archive-order-fpu-26.xlsx',
    sheetName: 'Акт выполненных работ',
    rowNumber: 42,
    payload: {
      type: 'nomenclature',
      dpo: unique,
      effectiveDate: '2026-07-31',
      formType: 'fpu-26',
      rowNumber: 42,
      name: `${unique} архив ФПУ ранняя строка`,
      unit: 'шт.',
      position: null,
      employee: null,
      quantity: 1,
      priceWithoutVat: 2224.85,
      displayedPriceWithoutVat: 2224.85,
      subtotalWithoutVat: 2224.85,
      vatAmount: 111.2425,
      totalWithVat: 2336.0925,
      sourceFormulas: {},
    },
  });

  const archiveXlsx = await auth(agent.get('/api/v1/print-forms/fpu-26'))
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
  assert.ok(
    archiveValues.some((value) => value.includes(`${unique} архив ФПУ`)),
    'архивные строки ФПУ-26 должны попасть в форму',
  );
  assert.equal(archiveSheet.getColumn(7).hidden, false, 'исходная цена ФПУ должна быть видимой');
  assert.match(
    String(archiveSheet.getCell('A42').value ?? ''),
    /ранняя строка/,
    'строки архивного ФПУ-26 должны сохранять исходный порядок Excel',
  );
  assert.match(String(archiveSheet.getCell('A43').value ?? ''), /поздняя строка/);
  assert.equal(archiveSheet.getCell('F42').value, 1);
  assert.equal(archiveSheet.getCell('G42').value, 2224.85);
  assert.equal(archiveSheet.getCell('H42').value, 2224.85);
  assert.equal(archiveSheet.getCell('I43').value, 11323.95);
  assert.equal(archiveSheet.getCell('K43').value, 566.1975);
  assert.equal(archiveSheet.getCell('L43').value, 11890.1475);
  assert.equal(dpo.name, unique);
});
