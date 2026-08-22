// Требует применённых миграций и сида (pnpm db:migrate && pnpm db:seed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { env } from '../config/env.js';
import { models } from '../database/models/index.js';
import {
  binaryParser,
  setupApp,
  setupBaseFixture,
  addSecondPriceAndIssuance,
  createArchiveRecord,
  destroyLiveIssuanceState,
  cleanupFixtureState,
} from './print-forms-fixture.js';

test('печатная форма Приложение 1.7: исторические цены, дедупликация архива, порядок строк', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const { agent, auth } = await setupApp();
  const unique = `Test Appendix17 ${Date.now()}`;
  const { state, employee, model } = await setupBaseFixture({ agent, auth, unique });
  t.after(() => cleanupFixtureState(state));

  const query = { dpoId: state.dpoId, from: '2026-07-01', to: '2026-07-31' };

  const xlsx = await auth(agent.get('/api/v1/print-forms/appendix-1-7'))
    .query({ ...query, format: 'xlsx' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(xlsx.status, 200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsx.body);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.getColumn(8).hidden, false, 'колонка цены должна быть видимой');
  assert.equal(sheet.getCell('G8').value, 1, 'выдача qty=2 даёт учётное кол-во 1');
  assert.match(
    String(sheet.getCell('E8').value ?? ''),
    /.+,.+/,
    'в строке остаются оба инвентарных номера',
  );
  assert.equal(sheet.getCell('H8').fill?.pattern, 'solid');
  assert.match(sheet.getCell('H8').numFmt, /0\.00/);
  const cellValues = [];
  let hasFormula = false;
  sheet.eachRow((row) =>
    row.eachCell((cell) => {
      cellValues.push(String(cell.value ?? ''));
      if (cell.value && typeof cell.value === 'object' && cell.value.formula) hasFormula = true;
    }),
  );
  assert.ok(cellValues.some((value) => value.includes(unique)));
  assert.ok(hasFormula, 'в расчётных ячейках должны быть формулы');

  const pdf = await auth(agent.get('/api/v1/print-forms/appendix-1-7'))
    .query({ ...query, format: 'pdf' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdf.body.length > 5000);

  // Вторая выдача после смены цены (2000 руб. с 20.07.2026): обе выдачи должны
  // сохранить свою цену на момент проведения, даже если справочник цен потом
  // снова изменится (ценовой снимок строки — релиз 12).
  const { secondPrice } = await addSecondPriceAndIssuance({ agent, auth, state, model });
  const snapshottedLines = await models.IssuanceLine.findAll({
    where: { documentId: [state.issuanceId, state.secondIssuanceId] },
    order: [['priceWithoutVatSnapshot', 'ASC']],
  });
  assert.deepEqual(
    snapshottedLines.map((line) => Number(line.priceWithoutVatSnapshot)),
    [1000, 2000],
  );
  await models.NomenclaturePrice.update(
    { priceWithoutVat: 9999, priceWithVat: 10498.95 },
    { where: { id: secondPrice.id } },
  );
  const historicalPrices = await auth(agent.get('/api/v1/print-forms/appendix-1-7'))
    .query({ ...query, format: 'xlsx' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(historicalPrices.status, 200);
  const historicalWorkbook = new ExcelJS.Workbook();
  await historicalWorkbook.xlsx.load(historicalPrices.body);
  const historicalValues = [];
  historicalWorkbook.worksheets[0].getColumn(8).eachCell((cell) => {
    if (typeof cell.value === 'number') historicalValues.push(cell.value);
  });
  assert.equal(historicalValues.filter((value) => value === 1000).length, 1);
  assert.equal(historicalValues.filter((value) => value === 2000).length, 1);

  // Архивная копия уже живой выдачи (тот же работник/модель/дата/количество)
  // не должна создать дублирующую строку — только уникальная архивная строка.
  const mixedArchivePayloads = [
    {
      type: 'nomenclature',
      dpo: unique,
      effectiveDate: '2026-07-15',
      name: unique,
      unit: 'шт.',
      employee: {
        fullName: employee.fullName,
        personnelNumber: employee.personnelNumber,
      },
      quantity: 2,
      priceWithoutVat: 1000,
      priceWithVat: 1050,
      subtotalWithoutVat: 2000,
      vatAmount: 100,
      totalWithVat: 2100,
    },
    {
      type: 'nomenclature',
      dpo: unique,
      effectiveDate: '2026-07-20',
      name: `${unique} смешанный архив`,
      unit: 'шт.',
      employee: { fullName: 'Архивный сотрудник', personnelNumber: 'MIX-001' },
      quantity: 1,
      priceWithoutVat: 500,
      priceWithVat: 525,
      subtotalWithoutVat: 500,
      vatAmount: 25,
      totalWithVat: 525,
    },
  ];
  for (const [index, payload] of mixedArchivePayloads.entries()) {
    await createArchiveRecord({
      state,
      sourceKeyPrefix: `print-form-mixed-test-${index}`,
      sourceFile: 'zz-mixed-archive.xlsx',
      sheetName: 'Приложение 1.7',
      rowNumber: index + 1,
      payload,
    });
  }
  const mixed = await auth(agent.get('/api/v1/print-forms/appendix-1-7'))
    .query({ ...query, format: 'xlsx' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(mixed.status, 200);
  const mixedWorkbook = new ExcelJS.Workbook();
  await mixedWorkbook.xlsx.load(mixed.body);
  const mixedModels = [];
  mixedWorkbook.worksheets[0].getColumn(4).eachCell((cell) => {
    mixedModels.push(String(cell.value ?? ''));
  });
  assert.equal(
    mixedModels.filter((value) => value === unique).length,
    2,
    'архивная копия живой выдачи не должна создавать дополнительную строку',
  );
  assert.ok(mixedModels.includes(`${unique} смешанный архив`));

  // Архивные строки без совпадающей живой выдачи должны сохранять исходный
  // порядок Excel по номеру строки, а не пересортировываться алфавитно.
  // Живые строки убираются, иначе они займут первую строку данных перед
  // архивными и сдвинут ожидаемые номера ячеек.
  await destroyLiveIssuanceState(state);
  await createArchiveRecord({
    state,
    sourceKeyPrefix: 'print-form-archive-1-7-late',
    sourceFile: 'archive-order-1-7.xlsx',
    sheetName: 'Приложение 1.7',
    rowNumber: 20,
    payload: {
      type: 'nomenclature',
      dpo: unique,
      effectiveDate: '2026-07-31',
      rowNumber: 20,
      name: `${unique} архив 1.7 поздняя строка`,
      unit: 'шт.',
      position: null,
      employee: {
        fullName: 'Архивный Работник Заказчика',
        personnelNumber: 'АРХ-001',
      },
      quantity: 1,
      priceWithoutVat: 900,
      priceWithVat: 945,
      subtotalWithoutVat: 900,
      vatAmount: 45,
      totalWithVat: 945,
    },
  });
  await createArchiveRecord({
    state,
    sourceKeyPrefix: 'print-form-archive-1-7-early',
    sourceFile: 'archive-order-1-7.xlsx',
    sheetName: 'Приложение 1.7',
    rowNumber: 10,
    payload: {
      type: 'nomenclature',
      dpo: unique,
      effectiveDate: '2026-07-31',
      rowNumber: 10,
      name: `${unique} архив 1.7 ранняя строка`,
      unit: 'шт.',
      position: null,
      employee: {
        fullName: 'Архивный Работник Заказчика',
        personnelNumber: 'АРХ-001',
      },
      quantity: 0,
      priceWithoutVat: 123.45678,
      priceWithVat: 0,
      subtotalWithoutVat: 0,
      vatAmount: 0,
      totalWithVat: 0,
    },
  });
  const archiveOrder = await auth(agent.get('/api/v1/print-forms/appendix-1-7'))
    .query({ ...query, format: 'xlsx' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(archiveOrder.status, 200);
  const archiveOrderWorkbook = new ExcelJS.Workbook();
  await archiveOrderWorkbook.xlsx.load(archiveOrder.body);
  const archiveOrderValues = [];
  archiveOrderWorkbook.worksheets[0].eachRow((row) =>
    row.eachCell((cell) => archiveOrderValues.push(String(cell.value ?? ''))),
  );
  assert.ok(archiveOrderValues.some((value) => value.includes('Архивный Работник Заказчика')));
  assert.match(
    String(archiveOrderWorkbook.worksheets[0].getCell('D8').value ?? ''),
    /ранняя строка/,
    'строки архивного акта должны сохранять исходный порядок Excel',
  );
});
