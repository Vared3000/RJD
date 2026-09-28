// Требует применённых миграций и сида (pnpm db:migrate && pnpm db:seed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { generatePdfFromExcel } from '../modules/print-forms/shared/excel-to-pdf.js';
import { env } from '../config/env.js';
import {
  binaryParser,
  setupApp,
  setupBaseFixture,
  cleanupFixtureState,
} from './print-forms-fixture.js';

test('сохранная расписка строится по проведённым выдачам выбранного дня', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const { agent, auth } = await setupApp();
  const unique = `Test Preservation ${Date.now()}`;
  const { state, employee, model, dpo } = await setupBaseFixture({ agent, auth, unique });
  t.after(() => cleanupFixtureState(state));

  const query = {
    dpoId: state.dpoId,
    from: '2026-07-15',
    to: '2026-07-15',
  };
  const xlsx = await auth(agent.get('/api/v1/print-forms/preservation-receipt'))
    .query({ ...query, format: 'xlsx' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(xlsx.status, 200);
  assert.match(xlsx.headers['content-type'], /spreadsheetml/);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsx.body);
  assert.equal(workbook.worksheets.length, 1);
  const sheet = workbook.worksheets[0];
  assert.match(String(sheet.getCell('B1').value), /^Сохранная расписка\n/);
  assert.match(String(sheet.getCell('B1').value), new RegExp(dpo.fullName));
  assert.match(String(sheet.getCell('B1').value), new RegExp(`${dpo.name}$`));
  assert.match(String(sheet.getCell('E2').value), /15.*июля.*2026/);
  assert.equal(sheet.getCell('A5').value, 1);
  assert.equal(sheet.getCell('B5').value, employee.fullName.replace(/^([^\s]+)\s+/, '$1\n'));
  assert.equal(sheet.getCell('C5').value, employee.personnelNumber);
  assert.equal(sheet.getCell('D5').value, model.name);
  assert.equal(sheet.getCell('E5').value, 'шт');
  assert.equal(sheet.getCell('F5').value, 2);
  assert.equal(sheet.getCell('G5').value, null);
  assert.match(workbook.subject, /шаблон v2/);
  assert.equal(sheet.pageSetup.orientation, 'portrait');
  assert.equal(sheet.pageSetup.fitToPage, true);
  assert.equal(sheet.pageSetup.fitToWidth, 1);
  assert.equal(sheet.pageSetup.fitToHeight, 0);
  assert.equal(sheet.pageSetup.printTitlesRow, undefined);
  assert.equal(sheet.pageSetup.printArea, 'A1:G5');
  assert.equal(sheet.headerFooter?.oddFooter, undefined);

  // Многостраничная расписка остаётся одним документом: заголовочные строки
  // не назначены печатными заголовками, поэтому листы 2+ продолжают таблицу.
  for (let rowNumber = 6; rowNumber <= 95; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.values = [
      rowNumber - 4,
      `Работник ${rowNumber}`,
      `Т-${rowNumber}`,
      `Длинное наименование выданного изделия ${rowNumber}`,
      'шт',
      1,
      '',
    ];
    row.height = 25.5;
    for (let column = 1; column <= 7; column += 1) {
      row.getCell(column).style = { ...sheet.getCell(5, column).style };
    }
  }
  sheet.pageSetup.printArea = 'A1:G95';
  const multiPageExcel = await workbook.xlsx.writeBuffer();
  const multiPagePdf = await generatePdfFromExcel(multiPageExcel, {
    form: 'preservation-receipt',
    generatedAt: '2026-07-15T12:00:00.000Z',
    dataSources: [],
  });
  const pageObjects = multiPagePdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? [];
  assert.ok(pageObjects.length >= 3, 'контрольная расписка должна занимать не менее 3 листов');
  assert.equal(sheet.pageSetup.printTitlesRow, undefined);

  const pdf = await auth(agent.get('/api/v1/print-forms/preservation-receipt'))
    .query({ ...query, format: 'pdf' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdf.body.length > 4000);

  const secondIssuance = await auth(agent.post('/api/v1/issuance/documents')).send({
    employeeId: state.employeeId,
    warehouseId: state.warehouseId,
    documentDate: '2026-07-15',
  });
  state.secondIssuanceId = secondIssuance.body.data.id;
  await auth(agent.post(`/api/v1/issuance/documents/${state.secondIssuanceId}/lines`)).send({
    modelId: state.modelId,
    sizeId: state.sizeId,
    quantity: 1,
  });
  await auth(agent.post(`/api/v1/issuance/documents/${state.secondIssuanceId}/post`));

  const directXlsx = await auth(agent.get('/api/v1/print-forms/preservation-receipt'))
    .query({ issuanceId: state.issuanceId, format: 'xlsx' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(directXlsx.status, 200);
  const directWorkbook = new ExcelJS.Workbook();
  await directWorkbook.xlsx.load(directXlsx.body);
  const directSheet = directWorkbook.worksheets[0];
  assert.equal(directSheet.getCell('B5').value, employee.fullName.replace(/^([^\s]+)\s+/, '$1\n'));
  assert.equal(directSheet.getCell('F5').value, 2);
  assert.equal(directSheet.getCell('D6').value, null);

  const invalidPeriod = await auth(agent.get('/api/v1/print-forms/preservation-receipt')).query({
    ...query,
    from: '2026-07-14',
    format: 'xlsx',
  });
  assert.equal(invalidPeriod.status, 400);
  assert.match(invalidPeriod.body.error.message, /один день/);
});
