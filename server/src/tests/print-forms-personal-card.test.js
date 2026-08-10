// Требует применённых миграций и сида (pnpm db:migrate && pnpm db:seed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { env } from '../config/env.js';
import {
  binaryParser,
  setupApp,
  setupBaseFixture,
  createReturnDocument,
  createArchiveRecord,
  destroyLiveIssuanceState,
  cleanupFixtureState,
} from './print-forms-fixture.js';

test('печатная форма личная карточка: живая история выдачи/возврата и архивный fallback', async (t) => {
  if (!env.BOOTSTRAP_ADMIN_PASSWORD) {
    t.skip('BOOTSTRAP_ADMIN_PASSWORD не задан — пропуск');
    return;
  }

  const { agent, auth } = await setupApp();
  const unique = `Test PersonalCard ${Date.now()}`;
  const { state, employee } = await setupBaseFixture({ agent, auth, unique });
  t.after(() => cleanupFixtureState(state));

  const returnPosted = await createReturnDocument({
    agent,
    auth,
    state,
    instanceId: state.instanceIds[0],
    documentDate: '2026-07-29',
  });
  assert.equal(returnPosted.status, 200);

  const personalCard = await auth(agent.get('/api/v1/print-forms/personal-card'))
    .query({ employeeId: state.employeeId, format: 'xlsx' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(personalCard.status, 200);
  const personalWorkbook = new ExcelJS.Workbook();
  await personalWorkbook.xlsx.load(personalCard.body);
  const personalSheet = personalWorkbook.worksheets[0];
  assert.match(String(personalSheet.getCell('A6').value ?? ''), /Петров Пётр Петрович/);
  assert.match(String(personalSheet.getCell('A7').value ?? ''), /52\/182/);
  assert.equal(personalSheet.getCell('B13').value, unique);
  assert.equal(personalSheet.getCell('F13').value, 4);
  assert.equal(personalSheet.getCell('G13').value, 1);
  assert.equal(personalSheet.getCell('H13').value, '15.07.2026');
  const returnedRow = [13, 14].find(
    (rowNumber) => personalSheet.getCell(`J${rowNumber}`).value === 1,
  );
  assert.ok(returnedRow, 'возврат должен быть отражён в личной карточке');
  assert.equal(personalSheet.getCell(`K${returnedRow}`).value, '29.07.2026');

  const personalPdf = await auth(agent.get('/api/v1/print-forms/personal-card'))
    .query({ employeeId: state.employeeId, format: 'pdf' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(personalPdf.status, 200);
  assert.equal(personalPdf.body.subarray(0, 4).toString(), '%PDF');
  assert.ok(personalPdf.body.length > 5000);

  // Без живых документов выдачи/возврата карточка должна переключиться на
  // архивный норматив, сохранённый при импорте.
  await destroyLiveIssuanceState(state);
  await createArchiveRecord({
    state,
    sourceKeyPrefix: 'print-form-archive-personal-card',
    sourceFile: 'archive-personal-card.xlsx',
    sheetName: 'Личная карточка',
    rowNumber: 13,
    payload: {
      type: 'nomenclature',
      dpo: unique,
      effectiveDate: '2021-06-01',
      formType: 'personal-card',
      cardStartRow: 1,
      rowNumber: 13,
      name: `${unique} архив личной карточки`,
      unit: 'шт.',
      position: unique,
      employee: {
        fullName: 'Петров Пётр Петрович',
        personnelNumber: employee.personnelNumber,
      },
      quantity: 1,
      normQuantity: 1,
      serviceLifeYears: 3,
      issuedQuantity: 1,
      issuedDate: '2021-06-01',
      returnedQuantity: 1,
      returnedDate: '2024-06-01',
    },
  });

  const archivedPersonalCard = await auth(agent.get('/api/v1/print-forms/personal-card'))
    .query({ employeeId: state.employeeId, format: 'xlsx' })
    .buffer(true)
    .parse(binaryParser);
  assert.equal(archivedPersonalCard.status, 200);
  const archivedPersonalWorkbook = new ExcelJS.Workbook();
  await archivedPersonalWorkbook.xlsx.load(archivedPersonalCard.body);
  const archivedPersonalSheet = archivedPersonalWorkbook.worksheets[0];
  assert.equal(archivedPersonalSheet.getCell('B13').value, `${unique} архив личной карточки`);
  assert.equal(archivedPersonalSheet.getCell('F13').value, 3);
  assert.equal(archivedPersonalSheet.getCell('H13').value, '01.06.2021');
  assert.equal(archivedPersonalSheet.getCell('K13').value, '01.06.2024');
});
